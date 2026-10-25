import {
  enrichDebt,
  DEBT_TYPES,
  debtTypeLabel,
  standardMonthlyPayment,
  suggestPayoffOrder,
} from './debts.js';

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

function typeOptions(selected) {
  return DEBT_TYPES.map(
    (t) =>
      `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${escapeHtml(
        t.label
      )}</option>`
  ).join('');
}

/**
 * Render debts panel: list, amortization summary, payment form, payoff comparison.
 */
export function renderDebts(debts, handlers = {}) {
  const panel = document.getElementById('debts-panel');
  if (!panel) return;

  const enriched = (debts || []).map((d) => enrichDebt(d));
  const totalBalance = enriched.reduce((s, d) => s + (Number(d.currentBalance) || 0), 0);
  const totalMin = enriched.reduce((s, d) => s + (Number(d.monthlyPayment) || 0), 0);
  const totalExtra = enriched.reduce((s, d) => s + (Number(d.extraPayment) || 0), 0);
  const totalInterestLeft = enriched.reduce(
    (s, d) => s + (Number(d.totalInterestRemaining) || 0),
    0
  );

  const avalanche = suggestPayoffOrder(enriched, 'avalanche');
  const snowball = suggestPayoffOrder(enriched, 'snowball');

  const cards = enriched
    .map((d) => {
      const barPct = d.progressPct;
      const isMortgage = d.isMortgage;

      return `
      <article class="debt-card" data-id="${escapeHtml(d.id)}">
        <div class="debt-card-header">
          <div>
            <h3 class="debt-name">${escapeHtml(d.name)}</h3>
            <span class="debt-type-badge">${escapeHtml(debtTypeLabel(d.type))}</span>
          </div>
          <div class="debt-actions">
            <button type="button" class="btn btn-sm btn-edit-debt" data-id="${escapeHtml(d.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-record-payment" data-id="${escapeHtml(d.id)}">Record payment</button>
            <button type="button" class="btn btn-sm btn-show-amort" data-id="${escapeHtml(d.id)}">Amortization</button>
            <button type="button" class="btn btn-sm btn-danger btn-delete-debt" data-id="${escapeHtml(d.id)}">Delete</button>
          </div>
        </div>

        <div class="debt-progress-wrap">
          <div class="progress-bar debt-progress">
            <div class="progress-fill ok" style="width:${Math.min(100, barPct)}%"></div>
          </div>
          <div class="debt-progress-meta">
            <span>${formatCurrency(d.paidDown)} paid of ${formatCurrency(d.originalPrincipal)}</span>
            <span>${barPct}%</span>
          </div>
        </div>

        <div class="debt-stats">
          <div class="debt-stat highlight">
            <span class="label">Balance</span>
            <strong>${formatCurrency(d.currentBalance)}</strong>
          </div>
          <div class="debt-stat">
            <span class="label">APR</span>
            <strong>${(Number(d.interestRate) || 0).toFixed(2)}%</strong>
          </div>
          <div class="debt-stat">
            <span class="label">Monthly P&amp;I</span>
            <strong>${formatCurrency(d.monthlyPayment)}</strong>
          </div>
          <div class="debt-stat">
            <span class="label">Extra / mo</span>
            <strong>${formatCurrency(d.extraPayment)}</strong>
          </div>
          ${
            isMortgage
              ? `<div class="debt-stat">
            <span class="label">Escrow / mo</span>
            <strong>${formatCurrency(d.escrowMonthly)}</strong>
          </div>
          <div class="debt-stat">
            <span class="label">Total housing</span>
            <strong>${formatCurrency(d.totalMonthlyOutflow)}</strong>
          </div>`
              : ''
          }
          <div class="debt-stat">
            <span class="label">Payoff</span>
            <strong>${d.payoffDate || '—'} (${d.payoffMonths || 0} mo)</strong>
          </div>
          <div class="debt-stat">
            <span class="label">Interest left</span>
            <strong>${formatCurrency(d.totalInterestRemaining)}</strong>
          </div>
          ${
            d.extraPayment > 0
              ? `<div class="debt-stat">
            <span class="label">Saved by extra</span>
            <strong class="on-track">${formatCurrency(d.interestSavedWithExtra)} · ${d.monthsSavedWithExtra} mo</strong>
          </div>`
              : ''
          }
        </div>

        ${
          isMortgage && d.propertyAddress
            ? `<p class="debt-address muted">${escapeHtml(d.propertyAddress)}</p>`
            : ''
        }

        <div class="debt-amort-slot" data-id="${escapeHtml(d.id)}" hidden></div>
        <div class="debt-payment-form-slot" data-id="${escapeHtml(d.id)}" hidden></div>

        ${
          (d.payments || []).length
            ? `<details class="debt-entries">
          <summary>Payment history (${d.payments.length})</summary>
          <ul>
            ${[...d.payments]
              .slice()
              .reverse()
              .slice(0, 20)
              .map(
                (p) => `
              <li>
                <span>${escapeHtml(p.date || '')}</span>
                <span class="entry-amt">${formatCurrency(p.amount)}</span>
                <span class="entry-type">${p.extra ? 'extra' : 'payment'}</span>
                <span class="muted">P ${formatCurrency(p.principal)} · I ${formatCurrency(p.interest)}</span>
                ${p.note ? `<span class="muted">${escapeHtml(p.note)}</span>` : ''}
              </li>`
              )
              .join('')}
          </ul>
        </details>`
            : ''
        }
      </article>`;
    })
    .join('');

  const orderBlock =
    enriched.length > 1
      ? `
    <div class="debt-strategy">
      <h3>Payoff order</h3>
      <div class="debt-strategy-cols">
        <div>
          <strong>Avalanche</strong> <span class="muted">(highest APR first)</span>
          <ol>${avalanche
            .map(
              (d) =>
                `<li>${escapeHtml(d.name)} — ${(Number(d.interestRate) || 0).toFixed(2)}% · ${formatCurrency(d.currentBalance)}</li>`
            )
            .join('')}</ol>
        </div>
        <div>
          <strong>Snowball</strong> <span class="muted">(lowest balance first)</span>
          <ol>${snowball
            .map(
              (d) =>
                `<li>${escapeHtml(d.name)} — ${formatCurrency(d.currentBalance)} · ${(Number(d.interestRate) || 0).toFixed(2)}%</li>`
            )
            .join('')}</ol>
        </div>
      </div>
    </div>`
      : '';

  panel.innerHTML = `
    <div class="debts-header">
      <h2>Debts</h2>
      <div class="debts-header-actions">
        <button type="button" class="btn btn-primary" id="btn-add-debt">Add debt</button>
      </div>
    </div>

    <div class="debt-summary-cards">
      <div class="card">
        <span class="label">Total balance</span>
        <span class="value">${formatCurrency(totalBalance)}</span>
      </div>
      <div class="card">
        <span class="label">Min payments</span>
        <span class="value">${formatCurrency(totalMin)}</span>
      </div>
      <div class="card">
        <span class="label">Extra planned</span>
        <span class="value">${formatCurrency(totalExtra)}</span>
      </div>
      <div class="card">
        <span class="label">Interest remaining</span>
        <span class="value">${formatCurrency(totalInterestLeft)}</span>
      </div>
    </div>

    <div class="debt-form-slot" id="debt-form-slot"></div>

    ${
      enriched.length === 0
        ? `<p class="empty">No debts yet. Add a mortgage, auto loan, credit card, or other debt to track balances, payments, interest, and payoff.</p>`
        : `<div class="debt-list">${cards}</div>${orderBlock}`
    }
  `;

  panel.querySelector('#btn-add-debt')?.addEventListener('click', () => {
    showDebtForm(null, handlers);
  });

  panel.querySelectorAll('.btn-edit-debt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const debt = enriched.find((d) => d.id === btn.dataset.id);
      if (debt) showDebtForm(debt, handlers);
    });
  });

  panel.querySelectorAll('.btn-delete-debt').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this debt?')) return;
      if (handlers.onDelete) await handlers.onDelete(btn.dataset.id);
    });
  });

  panel.querySelectorAll('.btn-record-payment').forEach((btn) => {
    btn.addEventListener('click', () => {
      const debt = enriched.find((d) => d.id === btn.dataset.id);
      if (debt) showPaymentForm(debt, handlers);
    });
  });

  panel.querySelectorAll('.btn-show-amort').forEach((btn) => {
    btn.addEventListener('click', () => {
      const debt = enriched.find((d) => d.id === btn.dataset.id);
      if (debt) toggleAmortization(debt);
    });
  });
}

function showDebtForm(existing, handlers) {
  const slot = document.getElementById('debt-form-slot');
  if (!slot) return;

  const d = existing || {
    name: '',
    type: 'mortgage',
    originalPrincipal: '',
    currentBalance: '',
    interestRate: '',
    monthlyPayment: '',
    extraPayment: 0,
    termMonths: 360,
    startDate: '',
    nextPaymentDate: '',
    propertyAddress: '',
    escrowMonthly: 0,
    notes: '',
  };

  slot.innerHTML = `
    <form class="debt-form" id="debt-form">
      <h3>${existing ? 'Edit debt' : 'Add debt'}</h3>
      <div class="form-grid">
        <label>Name
          <input name="name" required value="${escapeHtml(d.name)}" placeholder="Primary residence mortgage">
        </label>
        <label>Type
          <select name="type">${typeOptions(d.type || 'mortgage')}</select>
        </label>
        <label>Original principal
          <input name="originalPrincipal" type="number" min="0" step="0.01" value="${d.originalPrincipal ?? ''}" required>
        </label>
        <label>Current balance
          <input name="currentBalance" type="number" min="0" step="0.01" value="${d.currentBalance ?? ''}" required>
        </label>
        <label>Interest rate (APR %)
          <input name="interestRate" type="number" min="0" step="0.001" value="${d.interestRate ?? ''}" required>
        </label>
        <label>Term (months)
          <input name="termMonths" type="number" min="0" step="1" value="${d.termMonths ?? ''}" placeholder="360 for 30-year">
        </label>
        <label>Monthly payment (P&amp;I)
          <input name="monthlyPayment" type="number" min="0" step="0.01" value="${d.monthlyPayment ?? ''}">
          <span class="field-hint" id="suggested-pmt"></span>
        </label>
        <label>Extra payment / month
          <input name="extraPayment" type="number" min="0" step="0.01" value="${d.extraPayment ?? 0}">
        </label>
        <label>Start date
          <input name="startDate" type="date" value="${escapeHtml(d.startDate || '')}">
        </label>
        <label>Next payment date
          <input name="nextPaymentDate" type="date" value="${escapeHtml(d.nextPaymentDate || '')}">
        </label>
        <label class="mortgage-only">Escrow / month
          <input name="escrowMonthly" type="number" min="0" step="0.01" value="${d.escrowMonthly ?? 0}">
        </label>
        <label class="mortgage-only full-width">Property address
          <input name="propertyAddress" value="${escapeHtml(d.propertyAddress || '')}" placeholder="123 Main St, City, ST">
        </label>
        <label class="full-width">Notes
          <input name="notes" value="${escapeHtml(d.notes || '')}">
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" id="btn-cancel-debt-form">Cancel</button>
        <button type="button" class="btn" id="btn-calc-payment">Calculate payment from term</button>
      </div>
    </form>
  `;

  const form = slot.querySelector('#debt-form');
  const typeSelect = form.querySelector('[name="type"]');
  const updateMortgageFields = () => {
    const t = typeSelect.value;
    const show = t === 'mortgage' || t === 'home_equity';
    form.querySelectorAll('.mortgage-only').forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
  };
  typeSelect.addEventListener('change', updateMortgageFields);
  updateMortgageFields();

  const updateSuggested = () => {
    const bal = Number(form.originalPrincipal?.value || form.currentBalance?.value) || 0;
    const principal = Number(form.currentBalance.value) || bal;
    const rate = Number(form.interestRate.value) || 0;
    const term = Number(form.termMonths.value) || 0;
    const el = form.querySelector('#suggested-pmt');
    if (principal > 0 && term > 0) {
      const pmt = standardMonthlyPayment(principal, rate, term);
      el.textContent = `Suggested from balance & term: ${formatCurrency(pmt)}`;
    } else {
      el.textContent = '';
    }
  };
  ['currentBalance', 'interestRate', 'termMonths'].forEach((n) => {
    form.querySelector(`[name="${n}"]`)?.addEventListener('input', updateSuggested);
  });
  updateSuggested();

  form.querySelector('#btn-calc-payment')?.addEventListener('click', () => {
    const principal = Number(form.currentBalance.value) || 0;
    const rate = Number(form.interestRate.value) || 0;
    const term = Number(form.termMonths.value) || 0;
    if (principal > 0 && term > 0) {
      form.monthlyPayment.value = standardMonthlyPayment(principal, rate, term).toFixed(2);
    }
  });

  form.querySelector('#btn-cancel-debt-form')?.addEventListener('click', () => {
    slot.innerHTML = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      id: existing?.id,
      name: String(fd.get('name') || '').trim(),
      type: String(fd.get('type') || 'other'),
      originalPrincipal: Number(fd.get('originalPrincipal')) || 0,
      currentBalance: Number(fd.get('currentBalance')) || 0,
      interestRate: Number(fd.get('interestRate')) || 0,
      monthlyPayment: Number(fd.get('monthlyPayment')) || 0,
      extraPayment: Number(fd.get('extraPayment')) || 0,
      termMonths: Math.floor(Number(fd.get('termMonths')) || 0),
      startDate: fd.get('startDate') || null,
      nextPaymentDate: fd.get('nextPaymentDate') || null,
      escrowMonthly: Number(fd.get('escrowMonthly')) || 0,
      propertyAddress: String(fd.get('propertyAddress') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
      payments: existing?.payments || [],
    };
    if (handlers.onSave) {
      await handlers.onSave(payload);
      slot.innerHTML = '';
    }
  });
}

function showPaymentForm(debt, handlers) {
  const slot = document.querySelector(`.debt-payment-form-slot[data-id="${CSS.escape(debt.id)}"]`);
  if (!slot) return;

  if (!slot.hidden && slot.innerHTML) {
    slot.hidden = true;
    slot.innerHTML = '';
    return;
  }

  const defaultAmount =
    (Number(debt.monthlyPayment) || 0) + (Number(debt.extraPayment) || 0) ||
    Number(debt.monthlyPayment) ||
    0;

  const r = (Number(debt.interestRate) || 0) / 100 / 12;
  const interestEst = (Number(debt.currentBalance) || 0) * r;
  const principalEst = Math.max(0, defaultAmount - interestEst);

  slot.hidden = false;
  slot.innerHTML = `
    <form class="debt-payment-form">
      <h4>Record payment — ${escapeHtml(debt.name)}</h4>
      <div class="form-grid">
        <label>Amount
          <input name="amount" type="number" min="0.01" step="0.01" value="${defaultAmount.toFixed(2)}" required>
        </label>
        <label>Date
          <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </label>
        <label>Principal portion
          <input name="principal" type="number" min="0" step="0.01" value="${principalEst.toFixed(2)}">
        </label>
        <label>Interest portion
          <input name="interest" type="number" min="0" step="0.01" value="${interestEst.toFixed(2)}">
        </label>
        <label class="checkbox-label">
          <input name="extra" type="checkbox" ${debt.extraPayment > 0 ? 'checked' : ''}> Includes extra payment
        </label>
        <label class="full-width">Note
          <input name="note" placeholder="Optional">
        </label>
      </div>
      <p class="muted field-hint">Estimated interest this period: ${formatCurrency(interestEst)}. Adjust principal/interest if your statement differs.</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save payment</button>
        <button type="button" class="btn btn-cancel-payment">Cancel</button>
      </div>
    </form>
  `;

  const form = slot.querySelector('form');
  form.querySelector('.btn-cancel-payment')?.addEventListener('click', () => {
    slot.hidden = true;
    slot.innerHTML = '';
  });

  const amountInput = form.querySelector('[name="amount"]');
  const principalInput = form.querySelector('[name="principal"]');
  const interestInput = form.querySelector('[name="interest"]');
  amountInput.addEventListener('change', () => {
    const amt = Number(amountInput.value) || 0;
    const interest = Math.min(amt, (Number(debt.currentBalance) || 0) * r);
    interestInput.value = interest.toFixed(2);
    principalInput.value = Math.max(0, amt - interest).toFixed(2);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const entry = {
      amount: Number(fd.get('amount')),
      date: fd.get('date') || undefined,
      principal: Number(fd.get('principal')),
      interest: Number(fd.get('interest')),
      extra: form.querySelector('[name="extra"]').checked,
      note: String(fd.get('note') || '').trim(),
    };
    if (handlers.onPayment) {
      await handlers.onPayment(debt.id, entry);
      slot.hidden = true;
      slot.innerHTML = '';
    }
  });
}

function toggleAmortization(debt) {
  const slot = document.querySelector(`.debt-amort-slot[data-id="${CSS.escape(debt.id)}"]`);
  if (!slot) return;

  if (!slot.hidden && slot.innerHTML) {
    slot.hidden = true;
    slot.innerHTML = '';
    return;
  }

  const rows = debt.fullSchedule || [];
  const preview = rows.slice(0, 36);
  const more = rows.length - preview.length;

  slot.hidden = false;
  slot.innerHTML = `
    <div class="amort-table-wrap">
      <h4>Amortization schedule</h4>
      <p class="muted">
        ${rows.length} payments · payoff ${escapeHtml(debt.payoffDate || '—')} ·
        total interest ${formatCurrency(debt.totalInterestRemaining)}
        ${
          debt.extraPayment > 0
            ? ` · extra ${formatCurrency(debt.extraPayment)}/mo saves ${formatCurrency(debt.interestSavedWithExtra)}`
            : ''
        }
      </p>
      <div class="amort-scroll">
        <table class="amort-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Month</th>
              <th>Payment</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${preview
              .map(
                (r) => `
              <tr>
                <td>${r.month}</td>
                <td>${escapeHtml(r.date)}</td>
                <td>${formatCurrency(r.payment)}</td>
                <td>${formatCurrency(r.principal)}</td>
                <td>${formatCurrency(r.interest)}</td>
                <td>${formatCurrency(r.balance)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      ${more > 0 ? `<p class="muted">Showing first 36 of ${rows.length} payments.</p>` : ''}
      <button type="button" class="btn btn-sm btn-close-amort">Close</button>
    </div>
  `;

  slot.querySelector('.btn-close-amort')?.addEventListener('click', () => {
    slot.hidden = true;
    slot.innerHTML = '';
  });
}
