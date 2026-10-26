import { describe, it, expect } from 'vitest';
import { bankTransactions } from './bank-feed';
const row = { id: 'a', source: 'bank', date: '2026-10-27', description: '振込', amount: 100, receivedAt: '2026-10-27T00:30:00+09:00' };
describe('bank transaction archive', () => {
  it('retains identical legitimate transactions with separate occurrence IDs and zero notices', () => {
    const rows = bankTransactions({ version: 1, transactions: { a: row, b: { ...row, id: 'b' }, c: { ...row, id: 'c', amount: 0 } } });
    expect(rows).toHaveLength(3);
  });
  it('rejects malformed amounts, dates, identity, timestamps and envelopes', () => {
    for (const patch of [{ amount: '100' }, { amount: Infinity }, { amount: 1.1 }, { date: '2026-02-30' }, { id: 'wrong' }, { receivedAt: 'yesterday' }, { balance: '10' }])
      expect(bankTransactions({ version: 1, transactions: { a: { ...row, ...patch } } })).toEqual([]);
    expect(bankTransactions(null)).toEqual([]);
    expect(bankTransactions({version: 2, transactions: {a: row}})).toEqual([]);
  });
  it('does not mutate source data and retains signed amounts and balances', () => {
    const input = { version: 1, transactions: { a: { ...row, amount: -100, balance: 200 } } };
    const before = JSON.stringify(input);
    expect(bankTransactions(input)[0]).toMatchObject({ amount: -100, balance: 200 });
    expect(JSON.stringify(input)).toBe(before);
  });
});
