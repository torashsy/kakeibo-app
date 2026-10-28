import { describe, it, expect } from 'vitest';
import { latestBalances } from './latest-balances';
const now = Date.parse('2026-10-28T04:00:00Z');
const balance = (id: string, amount: number, asOf = '2026-10-28', issuedAt = '2026-10-28T03:43:00Z') => ({ id, kind: 'balance', status: 'confirmed', account: 'ゆうちょ', amount, asOf, issuedAt, receivedAt: issuedAt });
const feed = (...rows: object[]) => ({ version: 1, observations: Object.fromEntries(rows.map((r, i) => [i, r])) });
describe('latest bank balances', () => {
  it('selects the latest bank day, independent of delivery order and other accounts', () => {
    const input = feed(balance('old', 100, '2026-10-27', '2026-10-28T03:50:00Z'), balance('new', 592487));
    const original = JSON.stringify(input);
    const rows = latestBalances(input, ['ゆうちょ', 'NEOBANK'], now);
    expect(rows[0].observation?.amount).toBe(592487);
    expect(rows[1].observation).toBeNull();
    expect(JSON.stringify(input)).toBe(original);
  });
  it('does not use a global fresh check to hide stale bank data', () => {
    expect(latestBalances({ ...feed(balance('old', 100, '2026-10-26', '2026-10-26T03:43:00Z')), checkedAt: new Date(now).toISOString() }, ['ゆうちょ'], now)[0].status).toBe('stale');
  });
  it('withholds conflicting observations and rejects invalid or future timestamps', () => {
    expect(latestBalances(feed(balance('a', 100), balance('b', 200)), ['ゆうちょ'], now)[0].status).toBe('conflict');
    expect(latestBalances(feed(balance('a', -1), balance('b', 10, '2026-02-30'), balance('c', 100, '2026-10-29', '2026-10-29T00:00:00Z')), ['ゆうちょ'], now)[0].status).toBe('missing');
  });
});
