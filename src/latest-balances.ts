import { normalizeFinanceFeed, type FinanceObservation } from './finance';
import { financeFreshness } from './finance-freshness';

/** Current bank observations are independent of the selected ledger month and manual rows. */
export function latestBalances(raw: unknown, accounts: readonly string[], now = Date.now()) {
  const feed = normalizeFinanceFeed(raw);
  return [...new Set(accounts)].map(account => {
    const candidates = Object.values(feed?.observations || {}).filter(o => {
      const day = o.asOf;
      return o.kind === 'balance' && o.account === account && o.status === 'confirmed'
        && (!o.currency || o.currency === 'JPY') && Number.isSafeInteger(o.amount) && o.amount! >= 0
        && typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
        && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day
        && ['recent', 'stale'].includes(financeFreshness(o.issuedAt || o.receivedAt, now));
    }).sort((a, b) => b.asOf!.localeCompare(a.asOf!) || Date.parse(b.issuedAt || b.receivedAt) - Date.parse(a.issuedAt || a.receivedAt));
    const latest = candidates[0];
    const conflict = latest && candidates.some(o => o.asOf === latest.asOf
      && Date.parse(o.issuedAt || o.receivedAt) === Date.parse(latest.issuedAt || latest.receivedAt) && o.amount !== latest.amount);
    const observation: FinanceObservation | null = conflict ? null : latest || null;
    return { account, observation, status: conflict ? 'conflict' : observation ? financeFreshness(observation.issuedAt || observation.receivedAt, now) : 'missing' };
  });
}
