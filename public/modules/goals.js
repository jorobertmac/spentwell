/**
 * Savings goals: target date → required monthly contribution,
 * typical monthly contribution projections, external balances,
 * and interest/dividends (auto compound or manual entries).
 */

export function monthsBetween(fromDate, toDate) {
  const a = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Whole months remaining until targetDate (YYYY-MM-DD). Min 1 if still in the future. */
export function monthsRemaining(targetDateStr, from = new Date()) {
  if (!targetDateStr) return null;
  const target = new Date(targetDateStr + 'T12:00:00');
  if (Number.isNaN(target.getTime())) return null;
  if (target <= from) return 0;
  const m = monthsBetween(from, target);
  return Math.max(1, m);
}

/**
 * Required monthly contribution to hit target by end date (no interest).
 * remaining = target - currentTotal; divide by months left.
 */
export function requiredMonthlySimple(targetAmount, currentTotal, monthsLeft) {
  const need = Math.max(0, (Number(targetAmount) || 0) - (Number(currentTotal) || 0));
  if (!monthsLeft || monthsLeft <= 0) return need;
  return need / monthsLeft;
}

/**
 * Monthly payment needed to reach target with compound interest.
 * FV = P*(1+r)^n + PMT * ((1+r)^n - 1) / r
 * Solve for PMT.
 */
export function requiredMonthlyWithInterest(targetAmount, currentTotal, monthsLeft, annualRatePct) {
  const target = Number(targetAmount) || 0;
  const principal = Number(currentTotal) || 0;
  const n = Math.max(0, monthsLeft || 0);
  const r = (Number(annualRatePct) || 0) / 100 / 12;

  if (n <= 0) return Math.max(0, target - principal);
  if (r <= 0) return requiredMonthlySimple(target, principal, n);

  const futurePrincipal = principal * Math.pow(1 + r, n);
  const remaining = target - futurePrincipal;
  if (remaining <= 0) return 0;
  const factor = (Math.pow(1 + r, n) - 1) / r;
  return remaining / factor;
}

/**
 * Project balance after months of fixed contributions + compound interest.
 */
export function projectBalance(currentTotal, monthlyContribution, months, annualRatePct) {
  let bal = Number(currentTotal) || 0;
  const pmt = Number(monthlyContribution) || 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const n = Math.max(0, Math.floor(months) || 0);

  for (let i = 0; i < n; i++) {
    if (r > 0) bal *= 1 + r;
    bal += pmt;
  }
  return bal;
}

/** One month of interest on current balance (for auto mode). */
export function monthlyInterestAmount(balance, annualRatePct) {
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  return (Number(balance) || 0) * r;
}

export function goalCurrentTotal(goal) {
  const app = Number(goal.currentAmount) || 0;
  const external = Number(goal.externalBalance) || 0;
  return app + external;
}

export function enrichGoal(goal, fromDate = new Date()) {
  const currentTotal = goalCurrentTotal(goal);
  const target = Number(goal.targetAmount) || 0;
  const monthsLeft = monthsRemaining(goal.targetDate, fromDate);
  const rate = Number(goal.interestRate) || 0;
  const useInterest = goal.interestMode === 'auto' && rate > 0;

  const requiredMonthly =
    monthsLeft == null
      ? null
      : useInterest
        ? requiredMonthlyWithInterest(target, currentTotal, monthsLeft, rate)
        : requiredMonthlySimple(target, currentTotal, monthsLeft);

  const typical = Number(goal.monthlyContribution) || 0;
  const projected =
    monthsLeft == null
      ? null
      : projectBalance(currentTotal, typical, monthsLeft, useInterest ? rate : 0);

  const progressPct =
    target > 0 ? Math.min(100, Math.round((currentTotal / target) * 100)) : 0;

  return {
    ...goal,
    currentTotal,
    monthsLeft,
    requiredMonthly,
    projectedBalance: projected,
    progressPct,
    remainingToGoal: Math.max(0, target - currentTotal),
    onTrack:
      monthsLeft == null || monthsLeft === 0
        ? currentTotal >= target
        : projected != null && projected >= target - 0.01,
  };
}

export async function loadGoals() {
  try {
    const res = await fetch('/api/goals');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Failed to load goals:', err);
    return [];
  }
}

export async function saveGoal(goal) {
  const isNew = !goal.id;
  const res = await fetch(isNew ? '/api/goals' : `/api/goals/${encodeURIComponent(goal.id)}`, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goal),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save goal');
  }
  return res.json();
}

export async function deleteGoal(id) {
  const res = await fetch(`/api/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete goal');
  }
  return res.json();
}

/**
 * Add a contribution, interest, or balance adjustment.
 * body: { amount, type: 'contribution'|'interest'|'adjustment', note?, applyTo: 'app'|'external' }
 */
export async function addGoalEntry(id, entry) {
  const res = await fetch(`/api/goals/${encodeURIComponent(id)}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add entry');
  }
  return res.json();
}

/** Apply one month of auto interest for all goals in auto mode (or a single id). */
export async function applyAutoInterest(goalId = null) {
  const url = goalId
    ? `/api/goals/${encodeURIComponent(goalId)}/apply-interest`
    : '/api/goals/apply-interest';
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to apply interest');
  }
  return res.json();
}
