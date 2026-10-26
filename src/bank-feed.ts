/** Original bank/aggregator records are retained separately from the household ledger.
 * An aggregator can include both card purchases and the bank debit paying that card.
 * Summing these records into expenses would double count the same purchase.
 */
export interface BankTransaction {
  id: string;
  source: string;
  date: string;
  description: string;
  amount: number;
  account?: string;
  balance?: number;
  receivedAt: string;
}
export interface BankSnapshot {
  version: 1;
  checkedAt: string;
  coverage: string;
  transactions: Record<string, BankTransaction>;
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const time = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));

export function bankTransactions(value: unknown): BankTransaction[] {
  if (!record(value) || value.version !== 1 || !record(value.transactions)) return [];
  return Object.entries(value.transactions).flatMap(([key, x]) => {
    if (!record(x) || x.id !== key || !key || !date(x.date) || !time(x.receivedAt)
      || typeof x.source !== 'string' || !x.source.trim() || typeof x.description !== 'string'
      || !Number.isSafeInteger(x.amount) || (x.balance !== undefined && !Number.isSafeInteger(x.balance))
      || (x.account !== undefined && typeof x.account !== 'string')) return [];
    return [x as unknown as BankTransaction];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
