require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

function loadJson(filename, fallback = []) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filename, data) {
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

const CATEGORY_RULES = [
  { keywords: ['costco', 'walmart', 'kroger', 'safeway', 'grocery', 'trader joe', 'aldi', 'whole foods'], category: 'Groceries' },
  { keywords: ['mcdonald', 'starbucks', 'chipotle', 'restaurant', 'doordash', 'uber eats', 'grubhub', 'cafe', 'coffee'], category: 'Restaurants' },
  { keywords: ['shell', 'chevron', 'exxon', 'gas station', 'fuel', 'arco', 'circle k'], category: 'Gas' },
  { keywords: ['netflix', 'spotify', 'hulu', 'disney+', 'apple.com/bill', 'amazon prime'], category: 'Subscriptions' },
  { keywords: ['amazon', 'target', 'best buy'], category: 'Lifestyle' },
  { keywords: ['uber', 'lyft', 'transit'], category: 'Public Transit' },
  { keywords: ['rent', 'mortgage', 'landlord'], category: 'Rent / Mortgage' },
  { keywords: ['electric', 'water bill', 'utility', 'aps', 'srp'], category: 'Utilities' },
  { keywords: ['payroll', 'direct dep', 'salary', 'paycheck'], category: 'Paycheck' },
  { keywords: ['pharmacy', 'cvs', 'walgreens', 'doctor', 'hospital', 'dental'], category: 'Medical' },
  { keywords: ['gym', 'fitness', 'planet fitness', 'yoga'], category: 'Gym / Fitness' },
];

function suggestCategory(description) {
  const text = String(description || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      return rule.category;
    }
  }
  return 'Uncategorized';
}

function normalizeTransaction(row, source = 'csv') {
  const date =
    row.Date || row.date || row['Transaction Date'] || row['Posting Date'] || '';
  const description =
    row.Description || row.description || row.Memo || row.Payee || row.Name || '';
  const amountRaw = row.Amount || row.amount || row.Debit || row.Credit || '0';
  let amount = parseFloat(String(amountRaw).replace(/[$,]/g, '')) || 0;
  if (row.Debit && !row.Amount) {
    amount = -Math.abs(parseFloat(String(row.Debit).replace(/[$,]/g, '')) || 0);
  }
  if (row.Credit && !row.Amount) {
    amount = Math.abs(parseFloat(String(row.Credit).replace(/[$,]/g, '')) || 0);
  }
  const desc = description.trim();
  return {
    id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: date,
    amount,
    description: desc,
    merchant: desc.split(/\s{2,}|\//)[0] || desc,
    category: suggestCategory(desc),
    account: row.Account || row.account || 'Imported',
    source,
    pending: false,
  };
}

const DEFAULT_CATEGORIES = [
  { name: 'Paycheck', group: 'income', planned: 0 },
  { name: 'Side Income', group: 'income', planned: 0 },
  { name: 'Other Income', group: 'income', planned: 0 },
  { name: 'Tithe / Charity', group: 'giving', planned: 0 },
  { name: 'Emergency Fund', group: 'saving', planned: 0 },
  { name: 'Retirement', group: 'saving', planned: 0 },
  { name: 'Sinking Funds', group: 'saving', planned: 0 },
  { name: 'Rent / Mortgage', group: 'housing', planned: 0 },
  { name: 'Utilities', group: 'housing', planned: 0 },
  { name: 'Internet / Phone', group: 'housing', planned: 0 },
  { name: 'Gas', group: 'transportation', planned: 0 },
  { name: 'Car Payment', group: 'transportation', planned: 0 },
  { name: 'Car Maintenance', group: 'transportation', planned: 0 },
  { name: 'Public Transit', group: 'transportation', planned: 0 },
  { name: 'Groceries', group: 'food', planned: 0 },
  { name: 'Restaurants', group: 'food', planned: 0 },
  { name: 'Coffee / Snacks', group: 'food', planned: 0 },
  { name: 'Clothing', group: 'personal', planned: 0 },
  { name: 'Hair / Personal Care', group: 'personal', planned: 0 },
  { name: 'Subscriptions', group: 'lifestyle', planned: 0 },
  { name: 'Entertainment', group: 'lifestyle', planned: 0 },
  { name: 'Hobbies', group: 'lifestyle', planned: 0 },
  { name: 'Medical', group: 'health', planned: 0 },
  { name: 'Gym / Fitness', group: 'health', planned: 0 },
  { name: 'Health Insurance', group: 'insurance', planned: 0 },
  { name: 'Auto Insurance', group: 'insurance', planned: 0 },
  { name: 'Credit Card Payment', group: 'debt', planned: 0 },
  { name: 'Student Loans', group: 'debt', planned: 0 },
  { name: 'Other Debt', group: 'debt', planned: 0 },
  { name: 'Uncategorized', group: 'misc', planned: 0 },
];

function createDefaultBudget(month) {
  return {
    month,
    categories: DEFAULT_CATEGORIES.map((c, i) => ({
      id: `cat-${i}-${c.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: c.name,
      group: c.group,
      planned: c.planned,
    })),
    updatedAt: new Date().toISOString(),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'SpentWell' });
});

app.post('/api/import/csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const text = req.file.buffer.toString('utf8');
    const rawRows = parseCsv(text);
    const transactions = rawRows.map((row) => normalizeTransaction(row, 'csv'));
    const existing = loadJson('transactions.json', []);
    const merged = [...existing, ...transactions];
    saveJson('transactions.json', merged);
    res.json({ imported: transactions.length, total: merged.length, transactions });
  } catch (err) {
    console.error('CSV import error:', err);
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

app.get('/api/transactions', (_req, res) => {
  res.json(loadJson('transactions.json', []));
});

app.patch('/api/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const transactions = loadJson('transactions.json', []);
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Transaction not found' });
    if (typeof updates.category === 'string') {
      transactions[idx].category = updates.category.trim() || 'Uncategorized';
    }
    if (typeof updates.description === 'string') {
      transactions[idx].description = updates.description;
    }
    saveJson('transactions.json', transactions);
    res.json(transactions[idx]);
  } catch (err) {
    console.error('PATCH transaction error:', err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

app.post('/api/transactions/auto-categorize', (_req, res) => {
  try {
    const transactions = loadJson('transactions.json', []);
    let updated = 0;
    for (const tx of transactions) {
      if (!tx.category || tx.category === 'Uncategorized') {
        const suggested = suggestCategory(tx.description || tx.merchant);
        if (suggested !== 'Uncategorized') {
          tx.category = suggested;
          updated++;
        }
      }
    }
    saveJson('transactions.json', transactions);
    res.json({ updated, total: transactions.length });
  } catch (err) {
    console.error('Auto-categorize error:', err);
    res.status(500).json({ error: 'Auto-categorize failed' });
  }
});

app.get('/api/budget/:month', (req, res) => {
  try {
    const { month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Invalid month; use YYYY-MM' });
    }
    const all = loadJson('budgets.json', {});
    if (!all[month]) {
      const fresh = createDefaultBudget(month);
      all[month] = fresh;
      saveJson('budgets.json', all);
      return res.json(fresh);
    }
    res.json(all[month]);
  } catch (err) {
    console.error('GET budget error:', err);
    res.status(500).json({ error: 'Failed to load budget' });
  }
});

app.put('/api/budget/:month', (req, res) => {
  try {
    const { month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Invalid month; use YYYY-MM' });
    }
    const body = req.body || {};
    const all = loadJson('budgets.json', {});
    const budget = {
      month,
      categories: Array.isArray(body.categories) ? body.categories : [],
      updatedAt: new Date().toISOString(),
    };
    all[month] = budget;
    saveJson('budgets.json', all);
    res.json(budget);
  } catch (err) {
    console.error('PUT budget error:', err);
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

app.get('/api/budgets', (_req, res) => {
  const all = loadJson('budgets.json', {});
  res.json(Object.keys(all).sort().reverse());
});

app.post('/api/plaid/create-link-token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'spentwell-user' },
      client_name: 'SpentWell',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Plaid link token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

app.post('/api/plaid/exchange-public-token', async (req, res) => {
  try {
    const { public_token } = req.body;
    if (!public_token) return res.status(400).json({ error: 'public_token is required' });
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const accounts = loadJson('accounts.json', []);
    accounts.push({ item_id: itemId, access_token: accessToken, linked_at: new Date().toISOString() });
    saveJson('accounts.json', accounts);
    res.json({ success: true, item_id: itemId });
  } catch (err) {
    console.error('Plaid exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
});

app.get('/api/plaid/transactions', async (req, res) => {
  try {
    const accounts = loadJson('accounts.json', []);
    if (accounts.length === 0) {
      return res.json({ transactions: [], message: 'No linked accounts' });
    }
    const allTransactions = [];
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const account of accounts) {
      try {
        const response = await plaidClient.transactionsGet({
          access_token: account.access_token,
          start_date: startDate,
          end_date: endDate,
        });
        const txs = response.data.transactions.map((tx) => {
          const desc = tx.name || tx.merchant_name || '';
          const plaidCat =
            tx.personal_finance_category?.primary ||
            (tx.category && tx.category[0]) ||
            null;
          return {
            id: tx.transaction_id,
            date: tx.date,
            amount: -tx.amount,
            description: desc,
            merchant: tx.merchant_name || tx.name || '',
            category: plaidCat || suggestCategory(desc),
            account: tx.account_id,
            source: 'plaid',
            pending: tx.pending,
          };
        });
        allTransactions.push(...txs);
      } catch (err) {
        console.error('Plaid transactions error for item:', account.item_id, err.message);
      }
    }
    const existing = loadJson('transactions.json', []);
    const existingIds = new Set(existing.map((t) => t.id));
    const newOnes = allTransactions.filter((t) => !existingIds.has(t.id));
    if (newOnes.length > 0) {
      saveJson('transactions.json', [...existing, ...newOnes]);
    }
    res.json({ transactions: allTransactions, added: newOnes.length });
  } catch (err) {
    console.error('Plaid transactions route error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SpentWell running at http://localhost:${PORT}`);
});
