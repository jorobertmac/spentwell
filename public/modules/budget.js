/**
 * Budget logic: zero-based monthly budgets, category totals, categorization helpers.
 * Inspired by EveryDollar (assign every dollar a job) and similar envelope-style apps.
 */

const DEFAULT_GROUPS = [
  { id: 'income', name: 'Income', type: 'income' },
  { id: 'giving', name: 'Giving', type: 'expense' },
  { id: 'saving', name: 'Saving', type: 'expense' },
  { id: 'housing', name: 'Housing', type: 'expense' },
  { id: 'transportation', name: 'Transportation', type: 'expense' },
  { id: 'food', name: 'Food', type: 'expense' },
  { id: 'personal', name: 'Personal', type: 'expense' },
  { id: 'lifestyle', name: 'Lifestyle', type: 'expense' },
  { id: 'health', name: 'Health', type: 'expense' },
  { id: 'insurance', name: 'Insurance', type: 'expense' },
  { id: 'debt', name: 'Debt', type: 'expense' },
  { id: 'misc', name: 'Miscellaneous', type: 'expense' },
];

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

export function getDefaultGroups() {
  return DEFAULT_GROUPS.map((g) => ({ ...g }));
}

export function createDefaultBudgetCategories() {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: `cat-${i}-${c.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: c.name,
    group: c.group,
    planned: c.planned,
  }));
}

export function currentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}

export function transactionsInMonth(transactions, monthKey) {
  if (!monthKey) return transactions || [];
  return (transactions || []).filter((tx) => (tx.date || '').startsWith(monthKey));
}

export function spentByCategory(transactions) {
  const map = {};
  for (const tx of transactions || []) {
    if (tx.amount >= 0) continue;
    const name = tx.category || 'Uncategorized';
    map[name] = (map[name] || 0) + Math.abs(tx.amount);
  }
  return map;
}

export function computeBudgetSummary(budget, transactions) {
  const incomeItems = (budget?.categories || []).filter((c) => c.group === 'income');
  const expenseItems = (budget?.categories || []).filter((c) => c.group !== 'income');
  const incomePlanned = incomeItems.reduce((s, c) => s + (Number(c.planned) || 0), 0);
  const assigned = expenseItems.reduce((s, c) => s + (Number(c.planned) || 0), 0);
  const availableToBudget = incomePlanned - assigned;
  const monthTx = transactionsInMonth(transactions, budget?.month);
  const spentMap = spentByCategory(monthTx);
  let incomeActual = 0;
  for (const tx of monthTx) {
    if (tx.amount > 0) incomeActual += tx.amount;
  }
  const categories = (budget?.categories || []).map((c) => {
    const planned = Number(c.planned) || 0;
    const spent = c.group === 'income' ? 0 : spentMap[c.name] || 0;
    const remaining = planned - spent;
    return {
      ...c,
      planned,
      spent,
      remaining,
      percent: planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : spent > 0 ? 100 : 0,
      over: remaining < 0,
    };
  });
  const totalSpent = expenseItems.reduce((s, c) => s + (spentMap[c.name] || 0), 0);
  const totalRemaining = assigned - totalSpent;
  return {
    incomePlanned,
    incomeActual,
    assigned,
    availableToBudget,
    totalSpent,
    totalRemaining,
    isZeroBased: Math.abs(availableToBudget) < 0.01 && incomePlanned > 0,
    categories,
    groups: getDefaultGroups(),
  };
}

export function suggestCategory(description) {
  const text = String(description || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      return rule.category;
    }
  }
  return 'Uncategorized';
}

export async function loadTransactions() {
  try {
    const res = await fetch('/api/transactions');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Failed to load transactions:', err);
    return [];
  }
}

export async function loadBudget(month) {
  try {
    const res = await fetch(`/api/budget/${encodeURIComponent(month)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Failed to load budget:', err);
    return null;
  }
}

export async function saveBudget(month, budget) {
  const res = await fetch(`/api/budget/${encodeURIComponent(month)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(budget),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save budget');
  }
  return res.json();
}

export async function updateTransactionCategory(id, category) {
  const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update transaction');
  }
  return res.json();
}

export async function applyAutoCategorize() {
  const res = await fetch('/api/transactions/auto-categorize', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Auto-categorize failed');
  }
  return res.json();
}
