import {
  computeBudgetSummary,
  formatMonthLabel,
  transactionsInMonth,
  updateTransactionCategory,
} from './budget.js';

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value || 0);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTransactions(transactions, options = {}) {
  const list = document.getElementById('transaction-list');
  const countEl = document.getElementById('tx-count');
  const categoryNames = options.categoryNames || [];

  if (!transactions || transactions.length === 0) {
    list.innerHTML =
      '<p class="empty">No transactions yet. Import a CSV or link an account.</p>';
    countEl.textContent = '0 transactions';
    return;
  }

  const sorted = [...transactions].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );

  list.innerHTML = sorted
    .map((tx) => {
      const catOptions = categoryNames
        .map(
          (n) =>
            `<option value="${escapeHtml(n)}" ${
              n === (tx.category || 'Uncategorized') ? 'selected' : ''
            }>${escapeHtml(n)}</option>`
        )
        .join('');
      return `
      <div class="tx-row" data-id="${escapeHtml(tx.id)}">
        <div class="tx-main">
          <span class="tx-desc">${escapeHtml(tx.description || tx.merchant || '—')}</span>
          <span class="tx-meta">${tx.date || ''} · ${escapeHtml(tx.account || '')}</span>
          <label class="tx-cat-label">
            <select class="tx-category" data-id="${escapeHtml(tx.id)}" aria-label="Category">
              ${catOptions || `<option>${escapeHtml(tx.category || 'Uncategorized')}</option>`}
            </select>
          </label>
        </div>
        <span class="tx-amount ${tx.amount < 0 ? 'expense' : 'income'}">
          ${formatCurrency(tx.amount)}
        </span>
      </div>
    `;
    })
    .join('');

  countEl.textContent = `${transactions.length} transaction${
    transactions.length === 1 ? '' : 's'
  }`;

  list.querySelectorAll('.tx-category').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const category = e.target.value;
      try {
        await updateTransactionCategory(id, category);
        if (options.onCategoryChange) options.onCategoryChange();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

export function updateSummary(transactions) {
  let income = 0;
  let expenses = 0;
  for (const tx of transactions || []) {
    if (tx.amount > 0) income += tx.amount;
    else expenses += Math.abs(tx.amount);
  }
  const net = income - expenses;
  const incomeEl = document.getElementById('total-income');
  const expensesEl = document.getElementById('total-expenses');
  const netEl = document.getElementById('total-net');
  if (incomeEl) incomeEl.textContent = formatCurrency(income);
  if (expensesEl) expensesEl.textContent = formatCurrency(expenses);
  if (netEl) netEl.textContent = formatCurrency(net);
}

export function renderBudget(budget, transactions, handlers = {}) {
  const summary = computeBudgetSummary(budget, transactions);
  const panel = document.getElementById('budget-panel');
  if (!panel) return summary;

  const monthLabel = formatMonthLabel(budget?.month);
  const avail = summary.availableToBudget;
  const availClass =
    Math.abs(avail) < 0.01 ? 'zero' : avail > 0 ? 'positive' : 'negative';

  const byGroup = {};
  for (const g of summary.groups) {
    byGroup[g.id] = { ...g, items: [] };
  }
  for (const c of summary.categories) {
    const g = byGroup[c.group] || byGroup.misc;
    if (g) g.items.push(c);
  }

  let groupsHtml = '';
  for (const g of summary.groups) {
    const items = byGroup[g.id]?.items || [];
    if (items.length === 0) continue;
    const isIncome = g.type === 'income';
    groupsHtml += `
      <div class="budget-group" data-group="${escapeHtml(g.id)}">
        <h3 class="budget-group-title">${escapeHtml(g.name)}</h3>
        <div class="budget-lines">
          ${items
            .map((c) => {
              const barPct = Math.min(100, c.percent);
              const barClass = c.over ? 'over' : barPct >= 90 ? 'warn' : 'ok';
              return `
              <div class="budget-line" data-id="${escapeHtml(c.id)}">
                <div class="budget-line-main">
                  <span class="budget-line-name">${escapeHtml(c.name)}</span>
                  <div class="budget-line-amounts">
                    ${
                      isIncome
                        ? `<span class="planned-wrap">
                            <label>Planned</label>
                            <input type="number" step="0.01" min="0" class="planned-input"
                              data-id="${escapeHtml(c.id)}" value="${c.planned}" />
                          </span>`
                        : `
                          <span class="amt planned-wrap">
                            <label>Planned</label>
                            <input type="number" step="0.01" min="0" class="planned-input"
                              data-id="${escapeHtml(c.id)}" value="${c.planned}" />
                          </span>
                          <span class="amt"><label>Spent</label><strong>${formatCurrency(c.spent)}</strong></span>
                          <span class="amt remaining ${c.over ? 'over' : ''}">
                            <label>Left</label><strong>${formatCurrency(c.remaining)}</strong>
                          </span>`
                    }
                  </div>
                </div>
                ${
                  !isIncome
                    ? `<div class="progress-bar"><div class="progress-fill ${barClass}" style="width:${barPct}%"></div></div>`
                    : ''
                }
              </div>`;
            })
            .join('')}
        </div>
      </div>`;
  }

  panel.innerHTML = `
    <div class="budget-header">
      <div class="month-nav">
        <button type="button" class="btn btn-icon" id="btn-prev-month" aria-label="Previous month">‹</button>
        <h2 id="budget-month-label">${escapeHtml(monthLabel)}</h2>
        <button type="button" class="btn btn-icon" id="btn-next-month" aria-label="Next month">›</button>
      </div>
      <div class="zero-status ${summary.isZeroBased ? 'done' : ''}">
        ${
          summary.isZeroBased
            ? '<span class="check">✓</span> It\'s a zero-based budget'
            : 'Assign every dollar a job'
        }
      </div>
    </div>

    <div class="budget-summary-cards">
      <div class="card">
        <span class="label">Income (planned)</span>
        <span class="value">${formatCurrency(summary.incomePlanned)}</span>
      </div>
      <div class="card">
        <span class="label">Assigned</span>
        <span class="value">${formatCurrency(summary.assigned)}</span>
      </div>
      <div class="card ${availClass}">
        <span class="label">Available to budget</span>
        <span class="value">${formatCurrency(avail)}</span>
      </div>
      <div class="card">
        <span class="label">Spent this month</span>
        <span class="value expense-color">${formatCurrency(summary.totalSpent)}</span>
      </div>
    </div>

    <div class="budget-groups">
      ${groupsHtml}
    </div>
  `;

  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    handlers.onMonthChange?.(-1);
  });
  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    handlers.onMonthChange?.(1);
  });

  let saveTimer = null;
  panel.querySelectorAll('.planned-input').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.id;
      const val = parseFloat(input.value) || 0;
      if (handlers.onPlannedChange) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => handlers.onPlannedChange(id, val), 200);
      }
    });
  });

  return summary;
}

export function setActiveView(view) {
  document.querySelectorAll('.view-panel').forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}
