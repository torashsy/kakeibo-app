import { describe, it, expect } from 'vitest';
import { reconcileSubscriptions, subscriptionIdentity, subscriptionStatus } from './subscription-sync.js';
import { fixedForMonth, rollForwardSubs } from './utils';
const today = '2026-11-20';
const row = (id, date, amount, label = 'iCloud+ 200GB', extra = {}) => ({ id: `mf-card:${id}`, date, amount, subscriptionLabel: label, description: `${label}（APPLE.COM/BILL）`, account: 'Card', ...extra });
const feed = (rows, facts = []) => ({ bankSnapshot: { transactions: Object.fromEntries(rows.map(r => [r.id, r])) }, subscriptionContracts: Object.fromEntries(facts.map(f => [f.id, f])) });
const history = [row('a', '2026-08-29', -450), row('b', '2026-09-29', -540), row('c', '2026-10-29', -540)];
const canceled = { id: 'mail-cancel', key: 'icloud+|Apple', channel: 'Apple', name: 'iCloud+', observedOn: '2026-11-01', evidence: '解約メール', status: 'canceled', canceledOn: '2026-11-01', endDate: '2026-11-28', cycle: 'monthly', plan: '200GB' };

describe('subscription reconciliation', () => {
  it('tracks current amount, plan, cadence and estimated renewal from actual charges', () => {
    const result = reconcileSubscriptions([], feed(history), today);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'iCloud+', amount: 540, cycle: 'monthly', plan: '200GB', renewal: '2026-11-29', subscriptionSync: { status: 'observed', renewalEstimated: true, cycleKnown: true } });
    expect(rollForwardSubs(result, '2026-12-20')).toBe(result);
  });
  it('does not turn missed payments into cancellation or roll stale dates indefinitely', () => {
    const [sub] = reconcileSubscriptions([], feed(history), '2027-02-20');
    expect(subscriptionStatus(sub, '2027-02-20')).toBe('継続未確認');
    expect(sub.renewal).toBe('2026-11-29');
    expect(fixedForMonth([sub], '2027-02')).toBe(0);
  });
  it('cancellation is distinct from remaining access and removed from future payments', () => {
    const [sub] = reconcileSubscriptions([], feed(history, [canceled]), today);
    expect(subscriptionStatus(sub, today)).toBe('解約済み・利用期間中');
    expect(subscriptionStatus(sub, '2026-11-29')).toBe('解約済み');
    expect(sub.renewal).toBe('');
    expect(fixedForMonth([sub], '2026-12')).toBe(0);
  });
  it('does not resurrect a canceled contract on a later conflicting charge', () => {
    const [sub] = reconcileSubscriptions([], feed([...history, row('d','2026-12-12',-540)], [canceled]), '2026-12-15');
    expect(subscriptionStatus(sub, '2026-12-15')).toBe('終了後の請求あり');
    expect(sub.subscriptionSync.includeInForecast).toBe(false);
  });
  it('accepts an explicit later restart without keeping the old termination', () => {
    const restart = { ...canceled, id: 'restart', observedOn: '2026-11-18', status: 'active', canceledOn: '', endDate: '', renewal: '2026-12-18' };
    const [sub] = reconcileSubscriptions([], feed(history, [canceled, restart]), today);
    expect(sub.endDate).toBe('');
    expect(sub.subscriptionSync.status).toBe('observed');
  });
  it('keeps billing platforms separate and handles plan changes under one service', () => {
    const rows = [row('1','2026-09-01',-3000,'Claude Pro - Monthly'), row('2','2026-11-08',-20000,'Claude Max - Monthly'), row('3','2026-10-09',-1300,'PikPak',{description:'PAYPAL *PIKCLOUDPTE'}), row('4','2026-03-22',-7000,'PikPak 10TB（1年間）')];
    const result = reconcileSubscriptions([], feed(rows), today);
    expect(result).toHaveLength(3);
    expect(result.find(s => s.name === 'Claude')).toMatchObject({ plan: 'Max', amount: 20000, renewal: '2026-12-08' });
    expect(result.filter(s => s.name === 'PikPak').map(s => s.subscriptionSync.channel).sort()).toEqual(['Apple','PayPal']);
  });
  it('splits verified bundles only when component totals equal the charge', () => {
    const result = reconcileSubscriptions([], feed([row('bundle','2026-01-25',-7800,'Wink 年間VIP 7,400円 ＋ 食べログプレミアム 400円')]), today);
    expect(result).toHaveLength(2);
    expect(result.find(s => s.name === 'Wink')).toMatchObject({ amount:7400,cycle:'yearly',renewal:'2027-01-25' });
    expect(reconcileSubscriptions([], feed([row('bad','2026-01-25',-9000,'Wink 年間VIP 7,400円 ＋ 食べログプレミアム 400円')]), today)).toEqual([]);
  });
  it('refunds do not become fees or cancellation evidence; never counts a fully refunded charge', () => {
    const result = reconcileSubscriptions([], feed([row('a','2026-11-02',-3000,'Claude Pro - Monthly'), row('b','2026-11-02',3000,'Claude Pro - Monthly')]), today);
    expect(result).toEqual([]);
  });
  it('does not interpret several same-month charges as a single known renewal', () => {
    const [sub] = reconcileSubscriptions([], feed([row('a','2026-09-05',-550,'Fan Club'),row('b','2026-10-05',-550,'Fan Club'),row('c','2026-11-05',-550,'Fan Club'),row('d','2026-11-05',-550,'Fan Club')]),today);
    expect(sub.amount).toBe(1100);
    expect(sub.subscriptionSync.includeInForecast).toBe(false);
    expect(sub.renewal).toBe('');
  });
  it('preserves manual edits and deletions while refreshing new evidence idempotently', () => {
    const first = reconcileSubscriptions([],feed(history),today);
    const manual = [{...first[0],plan:'自分のメモ',note:'保持',hidden:true}];
    const nextFeed = feed([...history,row('d','2026-11-29',-600)]);
    const result = reconcileSubscriptions(manual,nextFeed,'2026-12-01');
    expect(result[0]).toMatchObject({plan:'自分のメモ',note:'保持',hidden:true,amount:600,renewal:'2026-12-29'});
    expect(reconcileSubscriptions(result,nextFeed,'2026-12-01')).toEqual(result);
  });
  it('preserves originals and ignores non-card, future, invalid and out-of-window rows', () => {
    const source = feed([...history,row('future','2027-01-01',-450),row('old','2024-01-01',-450),row('invalid','2026-99-99',-450),row('bank','2026-11-01',-450,'iCloud+ 200GB',{id:'bank:1'})]);
    const before = JSON.stringify(source);
    expect(reconcileSubscriptions([],source,today)[0].subscriptionSync.history).toHaveLength(3);
    expect(JSON.stringify(source)).toBe(before);
    expect(subscriptionIdentity('PikPak 10TB（1年間）','APPLE COM BILL').key).toBe('pikpak|Apple');
  });
});
