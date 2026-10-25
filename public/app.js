import { renderTransactions, updateSummary, renderBudget, setActiveView } from './modules/ui.js';
import { renderGoals } from './modules/goalsUi.js';
import { renderDebts } from './modules/debtsUi.js';
import { handleCsvImport } from './modules/csv.js';
import { initPlaid } from './modules/plaid.js';
import {
  loadTransactions,
  loadBudget,
  saveBudget,
  currentMonthKey,
  shiftMonth,
  transactionsInMonth,
  applyAutoCategorize,
} from './modules/budget.js';
import {
  loadGoals,
  saveGoal,
  deleteGoal,
  addGoalEntry,
  applyAutoInterest,
} from './modules/goals.js';
import {
  loadDebts,
  saveDebt,
  deleteDebt,
  recordPayment,
} from './modules/debts.js';

let state = {
  month: currentMonthKey(),
  transactions: [],
  budget: null,
  goals: [],
  debts: [],
  view: 'budget',
};

async function onMonthChange(delta) {
  state.month = shiftMonth(state.month, delta);
  await refresh();
}

async function onPlannedChange(catId, planned) {
  const cats = state.budget.categories.map((c) =>
    c.id === catId ? { ...c, planned } : c
  );
  state.budget = { ...state.budget, categories: cats };
  try {
    await saveBudget(state.month, state.budget);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
  renderBudget(state.budget, state.transactions, {
    onMonthChange,
    onPlannedChange,
  });
}

async function refreshGoals() {
  state.goals = await loadGoals();
  renderGoals(state.goals, {
    onSave: async (payload) => {
      try {
        await saveGoal(payload);
        await refreshGoals();
      } catch (err) {
        alert(err.message);
      }
    },
    onDelete: async (id) => {
      try {
        await deleteGoal(id);
        await refreshGoals();
      } catch (err) {
        alert(err.message);
      }
    },
    onAddEntry: async (id, entry) => {
      try {
        await addGoalEntry(id, entry);
        await refreshGoals();
      } catch (err) {
        alert(err.message);
      }
    },
    onApplyInterest: async () => {
      try {
        const result = await applyAutoInterest();
        alert(
          result.totalApplied > 0
            ? `Applied ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(result.totalApplied)} in interest.`
            : 'No auto-interest goals with a rate, or balances were zero.'
        );
        await refreshGoals();
      } catch (err) {
        alert(err.message);
      }
    },
  });
}

async function refreshDebts() {
  state.debts = await loadDebts();
  renderDebts(state.debts, {
    onSave: async (payload) => {
      try {
        await saveDebt(payload);
        await refreshDebts();
      } catch (err) {
        alert(err.message);
      }
    },
    onDelete: async (id) => {
      try {
        await deleteDebt(id);
        await refreshDebts();
      } catch (err) {
        alert(err.message);
      }
    },
    onPayment: async (id, entry) => {
      try {
        await recordPayment(id, entry);
        await refreshDebts();
      } catch (err) {
        alert(err.message);
      }
    },
  });
}

async function refresh() {
  state.transactions = await loadTransactions();
  state.budget = await loadBudget(state.month);
  if (!state.budget) {
    state.budget = { month: state.month, categories: [] };
  }

  renderBudget(state.budget, state.transactions, {
    onMonthChange,
    onPlannedChange,
  });

  const monthTx = transactionsInMonth(state.transactions, state.month);
  const categoryNames = (state.budget.categories || []).map((c) => c.name);
  if (!categoryNames.includes('Uncategorized')) categoryNames.push('Uncategorized');

  renderTransactions(monthTx, {
    categoryNames,
    onCategoryChange: () => refresh(),
  });
  updateSummary(monthTx);

  const hint = document.getElementById('tx-filter-hint');
  if (hint) {
    hint.textContent = `Showing ${state.month} only. Switch months on the Budget tab.`;
  }

  await refreshGoals();
  await refreshDebts();
}

async function init() {
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      setActiveView(state.view);
    });
  });
  setActiveView('budget');

  const importBtn = document.getElementById('btn-import');
  const csvInput = document.getElementById('csv-input');
  importBtn.addEventListener('click', () => csvInput.click());
  csvInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleCsvImport(file);
    csvInput.value = '';
    await refresh();
  });

  document.getElementById('btn-auto-cat')?.addEventListener('click', async () => {
    try {
      const result = await applyAutoCategorize();
      alert(`Updated ${result.updated} transaction(s).`);
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });

  initPlaid({ onLinked: () => refresh() });

  await refresh();
}

init().catch(console.error);
