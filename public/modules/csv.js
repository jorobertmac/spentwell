import { renderTransactions, updateSummary } from './ui.js';

export async function handleCsvImport(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/import/csv', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Import failed');
    }

    const data = await res.json();
    console.log(`Imported ${data.imported} transactions`);

    const allRes = await fetch('/api/transactions');
    const transactions = await allRes.json();

    renderTransactions(transactions);
    updateSummary(transactions);
  } catch (err) {
    console.error('CSV import error:', err);
    alert('Failed to import CSV: ' + err.message);
  }
}
