/**
 * Debt management HTTP routes (mortgage, student, auto, credit card, etc.).
 */
module.exports = function registerDebtsRoutes(app, { loadJson, saveJson }) {
  const DEBT_TYPES = [
    'mortgage',
    'home_equity',
    'auto',
    'student',
    'credit_card',
    'personal',
    'medical',
    'other',
  ];

  function normalizeDebt(raw, existing = null) {
    const id =
      (existing && existing.id) ||
      raw.id ||
      `debt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const type = DEBT_TYPES.includes(raw.type)
      ? raw.type
      : existing?.type || 'other';

    const originalPrincipal = Math.max(
      0,
      Number(raw.originalPrincipal ?? existing?.originalPrincipal) || 0
    );
    let currentBalance = Number(raw.currentBalance ?? existing?.currentBalance);
    if (!Number.isFinite(currentBalance)) currentBalance = originalPrincipal;
    currentBalance = Math.max(0, currentBalance);

    return {
      id,
      name: String(raw.name || existing?.name || 'Debt').trim() || 'Debt',
      type,
      originalPrincipal,
      currentBalance,
      interestRate: Math.max(0, Number(raw.interestRate ?? existing?.interestRate) || 0),
      monthlyPayment: Math.max(0, Number(raw.monthlyPayment ?? existing?.monthlyPayment) || 0),
      extraPayment: Math.max(0, Number(raw.extraPayment ?? existing?.extraPayment) || 0),
      termMonths: Math.max(0, Math.floor(Number(raw.termMonths ?? existing?.termMonths) || 0)),
      startDate:
        raw.startDate !== undefined
          ? raw.startDate || null
          : existing?.startDate || null,
      nextPaymentDate:
        raw.nextPaymentDate !== undefined
          ? raw.nextPaymentDate || null
          : existing?.nextPaymentDate || null,
      // Mortgage / HELOC extras
      propertyAddress:
        raw.propertyAddress !== undefined
          ? String(raw.propertyAddress || '').trim()
          : existing?.propertyAddress || '',
      escrowMonthly: Math.max(
        0,
        Number(raw.escrowMonthly ?? existing?.escrowMonthly) || 0
      ),
      notes:
        raw.notes !== undefined
          ? String(raw.notes || '').trim()
          : existing?.notes || '',
      payments: Array.isArray(raw.payments)
        ? raw.payments
        : existing?.payments || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  }

  app.get('/api/debts', (_req, res) => {
    try {
      const debts = loadJson('debts.json', []);
      res.json(debts);
    } catch (err) {
      console.error('GET debts error:', err);
      res.status(500).json({ error: 'Failed to load debts' });
    }
  });

  app.post('/api/debts', (req, res) => {
    try {
      const debts = loadJson('debts.json', []);
      const debt = normalizeDebt(req.body || {});
      debts.push(debt);
      saveJson('debts.json', debts);
      res.status(201).json(debt);
    } catch (err) {
      console.error('POST debt error:', err);
      res.status(500).json({ error: 'Failed to create debt' });
    }
  });

  app.put('/api/debts/:id', (req, res) => {
    try {
      const { id } = req.params;
      const debts = loadJson('debts.json', []);
      const idx = debts.findIndex((d) => d.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Debt not found' });
      const updated = normalizeDebt(req.body || {}, debts[idx]);
      updated.id = id;
      debts[idx] = updated;
      saveJson('debts.json', debts);
      res.json(updated);
    } catch (err) {
      console.error('PUT debt error:', err);
      res.status(500).json({ error: 'Failed to update debt' });
    }
  });

  app.delete('/api/debts/:id', (req, res) => {
    try {
      const { id } = req.params;
      const debts = loadJson('debts.json', []);
      const next = debts.filter((d) => d.id !== id);
      if (next.length === debts.length) {
        return res.status(404).json({ error: 'Debt not found' });
      }
      saveJson('debts.json', next);
      res.json({ success: true, id });
    } catch (err) {
      console.error('DELETE debt error:', err);
      res.status(500).json({ error: 'Failed to delete debt' });
    }
  });

  /**
   * Record a payment against a debt.
   * Body: { amount, date?, note?, extra? }
   * Applies payment to principal after interest for the period is optional client-side;
   * here we simply reduce balance by principal portion if provided, else by full amount.
   */
  app.post('/api/debts/:id/payments', (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }

      const debts = loadJson('debts.json', []);
      const idx = debts.findIndex((d) => d.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Debt not found' });

      const debt = debts[idx];
      const principalPortion = Number.isFinite(Number(body.principal))
        ? Math.max(0, Number(body.principal))
        : amount;
      const interestPortion = Number.isFinite(Number(body.interest))
        ? Math.max(0, Number(body.interest))
        : Math.max(0, amount - principalPortion);

      const appliedPrincipal = Math.min(principalPortion, Number(debt.currentBalance) || 0);
      debt.currentBalance = Math.max(0, (Number(debt.currentBalance) || 0) - appliedPrincipal);

      const payment = {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: body.date || new Date().toISOString().slice(0, 10),
        amount,
        principal: appliedPrincipal,
        interest: interestPortion,
        extra: Boolean(body.extra),
        note: String(body.note || '').trim(),
      };

      debt.payments = Array.isArray(debt.payments) ? debt.payments : [];
      debt.payments.push(payment);
      debt.updatedAt = new Date().toISOString();
      debts[idx] = debt;
      saveJson('debts.json', debts);
      res.json(debt);
    } catch (err) {
      console.error('POST debt payment error:', err);
      res.status(500).json({ error: 'Failed to record payment' });
    }
  });
};
