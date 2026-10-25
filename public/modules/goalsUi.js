import { enrichGoal } from './goals.js';

function formatCurrency(value) {
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

/**
 * Render savings goals panel: list, progress, required monthly, external balance, interest.
 */
export function renderGoals(goals, handlers = {}) {
  const panel = document.getElementById('goals-panel');
  if (!panel) return;

  const enriched = (goals || []).map((g) => enrichGoal(g));

  const cards = enriched
    .map((g) => {
      const req =
        g.requiredMonthly != null
          ? formatCurrency(g.requiredMonthly)
          : '— set target date';
      const proj =
        g.projectedBalance != null ? formatCurrency(g.projectedBalance) : '—';
      const monthsLabel =
        g.monthsLeft == null
          ? 'No end date'
          : g.monthsLeft === 0
            ? 'Past due / due this month'
            : `${g.monthsLeft} month${g.monthsLeft === 1 ? '' : 's'} left`;
      const trackClass = g.onTrack ? 'on-track' : 'off-track';
      const barPct = g.progressPct;
      const barClass = barPct >= 100 ? 'ok' : barPct >= 70 ? 'ok' : barPct >= 40 ? 'warn' : 'ok';

      return `
      <article class="goal-card" data-id="${escapeHtml(g.id)}">
        <div class="goal-card-header">
          <h3 class="goal-name">${escapeHtml(g.name)}</h3>
          <div class="goal-actions">
            <button type="button" class="btn btn-sm btn-edit-goal" data-id="${escapeHtml(g.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-add-entry" data-id="${escapeHtml(g.id)}">Add money</button>
            <button type="button" class="btn btn-sm btn-danger btn-delete-goal" data-id="${escapeHtml(g.id)}">Delete</button>
          </div>
        </div>

        <div class="goal-progress-wrap">
          <div class="progress-bar goal-progress">
            <div class="progress-fill ${barClass}" style="width:${Math.min(100, barPct)}%"></div>
          </div>
          <div class="goal-progress-meta">
            <span>${formatCurrency(g.currentTotal)} of ${formatCurrency(g.targetAmount)}</span>
            <span>${barPct}%</span>
          </div>
        </div>

        <div class="goal-stats">
          <div class="goal-stat">
            <span class="label">In app</span>
            <strong>${formatCurrency(g.currentAmount)}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">External account</span>
            <strong>${formatCurrency(g.externalBalance)}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">Still need</span>
            <strong>${formatCurrency(g.remainingToGoal)}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">End date</span>
            <strong>${g.targetDate ? escapeHtml(g.targetDate) : '—'}</strong>
          </div>
          <div class="goal-stat highlight">
            <span class="label">Required / month</span>
            <strong>${req}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">Your typical contribution</span>
            <strong>${formatCurrency(g.monthlyContribution || 0)}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">Projected at goal date</span>
            <strong class="${trackClass}">${proj}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">Timeline</span>
            <strong>${escapeHtml(monthsLabel)}</strong>
          </div>
          <div class="goal-stat">
            <span class="label">Interest</span>
            <strong>${
              g.interestMode === 'auto'
                ? `${Number(g.interestRate) || 0}% APY (auto)`
                : 'Manual entries'
            }</strong>
          </div>
        </div>

        ${
          Array.isArray(g.entries) && g.entries.length
            ? `<details class="goal-entries">
                <summary>Recent activity (${g.entries.length})</summary>
                <ul>
                  ${[...g.entries]
                    .slice(-8)
                    .reverse()
                    .map(
                      (e) =>
                        `<li><span class="entry-date">${escapeHtml(e.date || '')}</span>
                         <span class="entry-type">${escapeHtml(e.type || '')}</span>
                         <span class="entry-amt">${formatCurrency(e.amount)}</span>
                         ${e.note ? `<span class="entry-note">${escapeHtml(e.note)}</span>` : ''}
                         <span class="muted">(${escapeHtml(e.applyTo || 'app')})</span></li>`
                    )
                    .join('')}
                </ul>
              </details>`
            : ''
        }
      </article>`;
    })
    .join('');

  panel.innerHTML = `
    <div class="goals-header">
      <div>
        <h2>Savings goals</h2>
        <p class="muted">Set an end date to see required monthly savings. Track balances in a separate account and interest/dividends.</p>
      </div>
      <div class="goals-header-actions">
        <button type="button" class="btn" id="btn-apply-interest" title="Apply one month of interest to auto goals">Apply auto interest</button>
        <button type="button" class="btn btn-primary" id="btn-new-goal">New goal</button>
      </div>
    </div>

    <div id="goal-form-slot" class="goal-form-slot" hidden></div>

    <div class="goals-list">
      ${
        enriched.length
          ? cards
          : '<p class="empty">No savings goals yet. Create one to plan monthly contributions toward a target date.</p>'
      }
    </div>
  `;

  document.getElementById('btn-new-goal')?.addEventListener('click', () => {
    showGoalForm(null, handlers);
  });
  document.getElementById('btn-apply-interest')?.addEventListener('click', () => {
    handlers.onApplyInterest?.();
  });

  panel.querySelectorAll('.btn-edit-goal').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = (goals || []).find((x) => x.id === btn.dataset.id);
      showGoalForm(g || null, handlers);
    });
  });
  panel.querySelectorAll('.btn-delete-goal').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this savings goal?')) handlers.onDelete?.(btn.dataset.id);
    });
  });
  panel.querySelectorAll('.btn-add-entry').forEach((btn) => {
    btn.addEventListener('click', () => {
      showEntryForm(btn.dataset.id, handlers);
    });
  });
}

function showGoalForm(goal, handlers) {
  const slot = document.getElementById('goal-form-slot');
  if (!slot) return;
  const isEdit = !!(goal && goal.id);
  slot.hidden = false;
  slot.innerHTML = `
    <form class="goal-form" id="goal-form">
      <h3>${isEdit ? 'Edit goal' : 'New savings goal'}</h3>
      <div class="form-grid">
        <label>Name
          <input name="name" required value="${escapeHtml(goal?.name || '')}" placeholder="Emergency fund" />
        </label>
        <label>Target amount ($)
          <input name="targetAmount" type="number" step="0.01" min="0" required value="${goal?.targetAmount ?? ''}" />
        </label>
        <label>Current in app ($)
          <input name="currentAmount" type="number" step="0.01" min="0" value="${goal?.currentAmount ?? 0}" />
        </label>
        <label>External account balance ($)
          <input name="externalBalance" type="number" step="0.01" min="0" value="${goal?.externalBalance ?? 0}"
            title="Money in a bank/brokerage not linked in SpentWell" />
        </label>
        <label>Target end date
          <input name="targetDate" type="date" value="${escapeHtml(goal?.targetDate || '')}" />
        </label>
        <label>Typical monthly contribution ($)
          <input name="monthlyContribution" type="number" step="0.01" min="0" value="${goal?.monthlyContribution ?? 0}" />
        </label>
        <label>Interest mode
          <select name="interestMode">
            <option value="manual" ${goal?.interestMode !== 'auto' ? 'selected' : ''}>Manual (add interest yourself)</option>
            <option value="auto" ${goal?.interestMode === 'auto' ? 'selected' : ''}>Auto (compound monthly from APY)</option>
          </select>
        </label>
        <label>Annual rate / APY (%)
          <input name="interestRate" type="number" step="0.01" min="0" value="${goal?.interestRate ?? 0}"
            title="Used for auto interest and required-monthly calc when mode is Auto" />
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
        <button type="button" class="btn" id="btn-cancel-goal-form">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById('btn-cancel-goal-form')?.addEventListener('click', () => {
    slot.hidden = true;
    slot.innerHTML = '';
  });

  document.getElementById('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      id: goal?.id,
      name: fd.get('name'),
      targetAmount: parseFloat(fd.get('targetAmount')) || 0,
      currentAmount: parseFloat(fd.get('currentAmount')) || 0,
      externalBalance: parseFloat(fd.get('externalBalance')) || 0,
      targetDate: fd.get('targetDate') || null,
      monthlyContribution: parseFloat(fd.get('monthlyContribution')) || 0,
      interestMode: fd.get('interestMode') || 'manual',
      interestRate: parseFloat(fd.get('interestRate')) || 0,
      entries: goal?.entries || [],
    };
    handlers.onSave?.(payload);
    slot.hidden = true;
    slot.innerHTML = '';
  });
}

function showEntryForm(goalId, handlers) {
  const slot = document.getElementById('goal-form-slot');
  if (!slot) return;
  slot.hidden = false;
  slot.innerHTML = `
    <form class="goal-form" id="entry-form">
      <h3>Add money / interest</h3>
      <p class="muted">Contribution, interest/dividends, or balance adjustment. Choose app balance or external account.</p>
      <div class="form-grid">
        <label>Amount ($)
          <input name="amount" type="number" step="0.01" required placeholder="100.00" />
        </label>
        <label>Type
          <select name="type">
            <option value="contribution">Contribution</option>
            <option value="interest">Interest / dividend</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </label>
        <label>Apply to
          <select name="applyTo">
            <option value="app">App-tracked balance</option>
            <option value="external">External account</option>
          </select>
        </label>
        <label>Date
          <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
        </label>
        <label class="span-2">Note
          <input name="note" placeholder="Optional" />
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Add</button>
        <button type="button" class="btn" id="btn-cancel-entry-form">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById('btn-cancel-entry-form')?.addEventListener('click', () => {
    slot.hidden = true;
    slot.innerHTML = '';
  });

  document.getElementById('entry-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    handlers.onAddEntry?.(goalId, {
      amount: parseFloat(fd.get('amount')),
      type: fd.get('type'),
      applyTo: fd.get('applyTo'),
      date: fd.get('date') || undefined,
      note: fd.get('note') || '',
    });
    slot.hidden = true;
    slot.innerHTML = '';
  });
}
