import { renderTransactions, updateSummary } from './ui.js';

export function initPlaid(options = {}) {
  const btn = document.getElementById('btn-plaid');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      btn.textContent = 'Loading…';

      const tokenRes = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!tokenRes.ok) {
        throw new Error('Could not create link token. Check Plaid credentials.');
      }

      const { link_token } = await tokenRes.json();
      await loadPlaidScript();

      const handler = Plaid.create({
        token: link_token,
        onSuccess: async (public_token) => {
          const exchangeRes = await fetch('/api/plaid/exchange-public-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_token }),
          });

          if (!exchangeRes.ok) {
            throw new Error('Token exchange failed');
          }

          const txRes = await fetch('/api/plaid/transactions');
          const data = await txRes.json();

          if (options.onLinked) {
            await options.onLinked();
          } else {
            const allRes = await fetch('/api/transactions');
            const transactions = await allRes.json();
            renderTransactions(transactions);
            updateSummary(transactions);
          }

          alert(`Linked successfully. Added ${data.added ?? 0} new transactions.`);
        },
        onExit: (err) => {
          if (err) console.warn('Plaid Link exit:', err);
        },
      });

      handler.open();
    } catch (err) {
      console.error('Plaid error:', err);
      alert(err.message || 'Plaid connection failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Link Account';
    }
  });
}

function loadPlaidScript() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Plaid Link'));
    document.head.appendChild(script);
  });
}
