/**
 * Debt math: amortization, standard payment, extra payments, payoff projection.
 * Supports mortgage and other installment / revolving-style debts.
 */

export const DEBT_TYPES = [
  { id: 'mortgage', label: 'Home mortgage' },
  { id: 'home_equity', label: 'Home equity / HELOC' },
  { id: 'auto', label: 'Auto loan' },
  { id: 'student', label: 'Student loan' },
  { id: 'credit_card', label: 'Credit card' },
  { id: 'personal', label: 'Personal loan' },
  { id: 'medical', label: 'Medical' },
  { id: 'other', label: 'Other' },
];

export function debtTypeLabel(type) {
  const found = DEBT_TYPES.find((t) => t.id === type);
  return found ? found.label : type || 'Other';
}

/** Monthly interest rate from annual APR %. */
export function monthlyRate(annualRatePct) {
  return (Number(annualRatePct) || 0) / 100 / 12;
}

/**
 * Standard fixed payment for amortizing loan:
 * PMT = P * r(1+r)^n / ((1+r)^n - 1)
 */
export function standardMonthlyPayment(principal, annualRatePct, termMonths) {
  const P = Math.max(0, Number(principal) || 0);
  const n = Math.max(0, Math.floor(Number(termMonths) || 0));
  const r = monthlyRate(annualRatePct);
  if (P <= 0) return 0;
  if (n <= 0) return P;
  if (r <= 0) return P / n;
  const factor = Math.pow(1 + r, n);
  return (P * r * factor) / (factor - 1);
}

/**
 * Build amortization schedule from current balance.
 * monthlyPayment = scheduled payment (before extra)
 * extraPayment = additional principal each month
 * Returns rows until balance is paid off (or maxMonths safety).
 */
export function buildAmortizationSchedule({
  balance,
  annualRatePct,
  monthlyPayment,
  extraPayment = 0,
  startDate = null,
  maxMonths = 600,
}) {
  let bal = Math.max(0, Number(balance) || 0);
  const r = monthlyRate(annualRatePct);
  const basePmt = Math.max(0, Number(monthlyPayment) || 0);
  const extra = Math.max(0, Number(extraPayment) || 0);
  const totalPmt = basePmt + extra;

  const rows = [];
  let totalInterest = 0;
  let totalPrincipal = 0;
  let month = 0;

  let cursor = startDate ? new Date(startDate + 'T12:00:00') : new Date();
  if (Number.isNaN(cursor.getTime())) cursor = new Date();
  // First payment month: advance to next month if we start mid-month conceptually
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  while (bal > 0.005 && month < maxMonths) {
    month += 1;
    const interest = bal * r;
    let principalPaid = totalPmt - interest;

    // If payment doesn't cover interest (underpayment), still accrue interest
    if (principalPaid < 0) {
      // Minimum: pay only interest if user payment < interest (common on revolving)
      principalPaid = 0;
      // balance grows — stop runaway if payment is zero
      if (totalPmt <= 0) {
        rows.push({
          month,
          date: formatYm(cursor),
          payment: 0,
          principal: 0,
          interest,
          extra: 0,
          balance: bal + interest,
        });
        bal += interest;
        totalInterest += interest;
        // break after one such row to avoid infinite growth rows
        break;
      }
    }

    if (principalPaid > bal) principalPaid = bal;
    const actualPayment = principalPaid + interest;
    const extraApplied = Math.min(extra, principalPaid);
    bal = Math.max(0, bal - principalPaid);
    totalInterest += interest;
    totalPrincipal += principalPaid;

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);

    rows.push({
      month,
      date: formatYm(cursor),
      payment: actualPayment,
      principal: principalPaid,
      interest,
      extra: extraApplied,
      balance: bal,
    });
  }

  return {
    rows,
    months: month,
    totalInterest,
    totalPrincipal,
    payoffDate: rows.length ? rows[rows.length - 1].date : null,
    paidOff: bal <= 0.005,
  };
}

function formatYm(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Compare payoff with only minimum vs minimum + extra.
 */
export function payoffComparison(debt) {
  const balance = Number(debt.currentBalance) || 0;
  const rate = Number(debt.interestRate) || 0;
  const base = Number(debt.monthlyPayment) || 0;
  const extra = Number(debt.extraPayment) || 0;
  const start = debt.nextPaymentDate || debt.startDate || null;

  const without = buildAmortizationSchedule({
    balance,
    annualRatePct: rate,
    monthlyPayment: base,
    extraPayment: 0,
    startDate: start,
  });
  const withExtra = buildAmortizationSchedule({
    balance,
    annualRatePct: rate,
    monthlyPayment: base,
    extraPayment: extra,
    startDate: start,
  });

  const interestSaved = Math.max(0, without.totalInterest - withExtra.totalInterest);
  const monthsSaved = Math.max(0, without.months - withExtra.months);

  return {
    withoutExtra: without,
    withExtra,
    interestSaved,
    monthsSaved,
  };
}

/**
 * Enrich debt with derived fields for UI.
 */
export function enrichDebt(debt) {
  const balance = Number(debt.currentBalance) || 0;
  const original = Number(debt.originalPrincipal) || 0;
  const rate = Number(debt.interestRate) || 0;
  const payment = Number(debt.monthlyPayment) || 0;
  const extra = Number(debt.extraPayment) || 0;
  const escrow = Number(debt.escrowMonthly) || 0;

  const suggestedPayment =
    debt.termMonths > 0 && balance > 0
      ? standardMonthlyPayment(balance, rate, debt.termMonths)
      : payment;

  const comparison = payoffComparison(debt);
  const schedule = comparison.withExtra;

  const paidDown = original > 0 ? Math.max(0, original - balance) : 0;
  const progressPct =
    original > 0 ? Math.min(100, Math.round((paidDown / original) * 100)) : 0;

  // Monthly housing payment for mortgage (P&I + escrow)
  const totalMonthlyOutflow = payment + extra + escrow;

  return {
    ...debt,
    suggestedPayment,
    progressPct,
    paidDown,
    remainingPrincipal: balance,
    payoffMonths: schedule.months,
    payoffDate: schedule.payoffDate,
    totalInterestRemaining: schedule.totalInterest,
    interestSavedWithExtra: comparison.interestSaved,
    monthsSavedWithExtra: comparison.monthsSaved,
    totalMonthlyOutflow,
    schedulePreview: schedule.rows.slice(0, 12),
    fullSchedule: schedule.rows,
    isMortgage: debt.type === 'mortgage' || debt.type === 'home_equity',
  };
}

export async function loadDebts() {
  try {
    const res = await fetch('/api/debts');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Failed to load debts:', err);
    return [];
  }
}

export async function saveDebt(debt) {
  const isNew = !debt.id;
  const res = await fetch(isNew ? '/api/debts' : `/api/debts/${encodeURIComponent(debt.id)}`, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(debt),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save debt');
  }
  return res.json();
}

export async function deleteDebt(id) {
  const res = await fetch(`/api/debts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete debt');
  }
  return res.json();
}

export async function recordPayment(id, entry) {
  const res = await fetch(`/api/debts/${encodeURIComponent(id)}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to record payment');
  }
  return res.json();
}

/** Avalanche: highest rate first. Snowball: lowest balance first. */
export function suggestPayoffOrder(debts, strategy = 'avalanche') {
  const list = (debts || []).filter((d) => (Number(d.currentBalance) || 0) > 0);
  if (strategy === 'snowball') {
    return [...list].sort(
      (a, b) => (Number(a.currentBalance) || 0) - (Number(b.currentBalance) || 0)
    );
  }
  return [...list].sort(
    (a, b) => (Number(b.interestRate) || 0) - (Number(a.interestRate) || 0)
  );
}
