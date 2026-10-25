/**
 * Savings goals HTTP routes.
 */
module.exports = function registerGoalsRoutes(app, { loadJson, saveJson }) {
// ----- Savings Goals -----
function normalizeGoal(raw, existing = null) {
  const id =
    (existing && existing.id) ||
    raw.id ||
    `goal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  return {
    id,
    name: String(raw.name || existing?.name || 'Savings goal').trim() || 'Savings goal',
    targetAmount: Math.max(0, Number(raw.targetAmount ?? existing?.targetAmount) || 0),
    currentAmount: Math.max(0, Number(raw.currentAmount ?? existing?.currentAmount) || 0),
    externalBalance: Math.max(0, Number(raw.externalBalance ?? existing?.externalBalance) || 0),
    monthlyContribution: Math.max(0, Number(raw.monthlyContribution ?? existing?.monthlyContribution) || 0),
    targetDate: raw.targetDate !== undefined ? raw.targetDate || null : existing?.targetDate || null,
    interestRate: Math.max(0, Number(raw.interestRate ?? existing?.interestRate) || 0),
    interestMode:
      raw.interestMode === 'auto' || raw.interestMode === 'manual'
        ? raw.interestMode
        : existing?.interestMode || 'manual',
    entries: Array.isArray(raw.entries)
      ? raw.entries
      : existing?.entries || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function goalBalance(g) {
  return (Number(g.currentAmount) || 0) + (Number(g.externalBalance) || 0);
}

app.get('/api/goals', (_req, res) => {
  try {
    const goals = loadJson('goals.json', []);
    res.json(goals);
  } catch (err) {
    console.error('GET goals error:', err);
    res.status(500).json({ error: 'Failed to load goals' });
  }
});

app.post('/api/goals', (req, res) => {
  try {
    const goals = loadJson('goals.json', []);
    const goal = normalizeGoal(req.body || {});
    goals.push(goal);
    saveJson('goals.json', goals);
    res.status(201).json(goal);
  } catch (err) {
    console.error('POST goal error:', err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

app.put('/api/goals/:id', (req, res) => {
  try {
    const { id } = req.params;
    const goals = loadJson('goals.json', []);
    const idx = goals.findIndex((g) => g.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Goal not found' });
    const updated = normalizeGoal(req.body || {}, goals[idx]);
    updated.id = id;
    goals[idx] = updated;
    saveJson('goals.json', goals);
    res.json(updated);
  } catch (err) {
    console.error('PUT goal error:', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

app.delete('/api/goals/:id', (req, res) => {
  try {
    const { id } = req.params;
    const goals = loadJson('goals.json', []);
    const next = goals.filter((g) => g.id !== id);
    if (next.length === goals.length) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    saveJson('goals.json', next);
    res.json({ success: true, id });
  } catch (err) {
    console.error('DELETE goal error:', err);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

app.post('/api/goals/:id/entries', (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: 'amount must be a non-zero number' });
    }
    const type = ['contribution', 'interest', 'adjustment'].includes(body.type)
      ? body.type
      : 'contribution';
    const applyTo = body.applyTo === 'external' ? 'external' : 'app';

    const goals = loadJson('goals.json', []);
    const idx = goals.findIndex((g) => g.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Goal not found' });

    const goal = goals[idx];
    const entry = {
      id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: body.date || new Date().toISOString().slice(0, 10),
      amount,
      type,
      note: String(body.note || '').trim(),
      applyTo,
    };

    if (applyTo === 'external') {
      goal.externalBalance = Math.max(0, (Number(goal.externalBalance) || 0) + amount);
    } else {
      goal.currentAmount = Math.max(0, (Number(goal.currentAmount) || 0) + amount);
    }
    goal.entries = Array.isArray(goal.entries) ? goal.entries : [];
    goal.entries.push(entry);
    goal.updatedAt = new Date().toISOString();
    goals[idx] = goal;
    saveJson('goals.json', goals);
    res.json(goal);
  } catch (err) {
    console.error('POST goal entry error:', err);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

function applyInterestToGoal(goal) {
  const rate = Number(goal.interestRate) || 0;
  if (goal.interestMode !== 'auto' || rate <= 0) {
    return { goal, applied: 0 };
  }
  const monthlyRate = rate / 100 / 12;
  let applied = 0;

  const appBal = Number(goal.currentAmount) || 0;
  if (appBal > 0) {
    const interest = Math.round(appBal * monthlyRate * 100) / 100;
    if (interest > 0) {
      goal.currentAmount = appBal + interest;
      applied += interest;
      goal.entries = goal.entries || [];
      goal.entries.push({
        id: `ent-${Date.now()}-app-${Math.random().toString(36).slice(2, 5)}`,
        date: new Date().toISOString().slice(0, 10),
        amount: interest,
        type: 'interest',
        note: `Auto interest (${rate}% APY) on app balance`,
        applyTo: 'app',
      });
    }
  }

  const extBal = Number(goal.externalBalance) || 0;
  if (extBal > 0) {
    const interest = Math.round(extBal * monthlyRate * 100) / 100;
    if (interest > 0) {
      goal.externalBalance = extBal + interest;
      applied += interest;
      goal.entries = goal.entries || [];
      goal.entries.push({
        id: `ent-${Date.now()}-ext-${Math.random().toString(36).slice(2, 5)}`,
        date: new Date().toISOString().slice(0, 10),
        amount: interest,
        type: 'interest',
        note: `Auto interest (${rate}% APY) on external balance`,
        applyTo: 'external',
      });
    }
  }

  if (applied > 0) goal.updatedAt = new Date().toISOString();
  return { goal, applied };
}

app.post('/api/goals/apply-interest', (_req, res) => {
  try {
    const goals = loadJson('goals.json', []);
    let totalApplied = 0;
    const updated = goals.map((g) => {
      const { goal, applied } = applyInterestToGoal({ ...g, entries: [...(g.entries || [])] });
      totalApplied += applied;
      return goal;
    });
    saveJson('goals.json', updated);
    res.json({ goals: updated, totalApplied });
  } catch (err) {
    console.error('Apply interest error:', err);
    res.status(500).json({ error: 'Failed to apply interest' });
  }
});

app.post('/api/goals/:id/apply-interest', (req, res) => {
  try {
    const { id } = req.params;
    const goals = loadJson('goals.json', []);
    const idx = goals.findIndex((g) => g.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Goal not found' });
    const { goal, applied } = applyInterestToGoal({
      ...goals[idx],
      entries: [...(goals[idx].entries || [])],
    });
    goals[idx] = goal;
    saveJson('goals.json', goals);
    res.json({ goal, applied });
  } catch (err) {
    console.error('Apply interest single error:', err);
    res.status(500).json({ error: 'Failed to apply interest' });
  }
});

};
