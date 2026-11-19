import { classifyCardRows } from './card-purposes.js';

const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const dayNumber = value => Date.parse(value + 'T00:00:00Z') / 86400000;
export const subscriptionToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const advance = (date, cycle, preferredDay) => {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + (cycle === 'yearly' ? 12 : 1), 1));
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(preferredDay || d, end));
  return target.toISOString().slice(0, 10);
};

// A platform is part of the identity: a PayPal contract must not replace an App Store contract.
export function subscriptionIdentity(label, description = '') {
  let name = String(label || '').normalize('NFKC').trim(), plan = '';
  const channel = /apple[. ]com[ /]bill/i.test(description) ? 'Apple' : /google/i.test(description) ? 'Google' : /paypal/i.test(description) ? 'PayPal' : '直接';
  if (/^ChatGPT /.test(name)) { plan = name.slice(8); name = 'ChatGPT'; }
  else if (/^Claude /.test(name)) { plan = name.slice(7).replace(/ - Monthly$/, ''); name = 'Claude'; }
  else if (/^iCloud\+ /.test(name)) { plan = name.slice(8); name = 'iCloud+'; }
  else if (/^LINE(?: |学割)/.test(name)) { plan = /学割/.test(name) ? 'デラックスコース（学割）' : name.slice(5); name = 'LINEスタンプ'; }
  else if (/^radiko /.test(name)) { plan = name.slice(7); name = 'radiko'; }
  else if (/^Google AI Pro /.test(name)) { plan = name.slice(14); name = 'Google AI Pro'; }
  else if (/^PikPak /.test(name)) { plan = name.slice(7); name = 'PikPak'; }
  else if (/^YouTube Premium /.test(name)) { plan = name.slice(16); name = 'YouTube Premium'; }
  else if (/^(EPIK|Wink|Meitu) /.test(name)) { const space = name.indexOf(' '); plan = name.slice(space + 1); name = name.slice(0, space); }
  return { key: `${norm(name)}|${channel}`, name, plan, channel };
}

function parts(row) {
  const label = row.subscriptionLabel;
  if (!label || /払戻後|返金|取消|未使用分/.test(label)) return [];
  if (!/[＋]/.test(label)) return [{ label, amount: row.amount }];
  const parsed = label.split(/\s*＋\s*/).map(part => part.match(/^(.+?)\s+([\d,]+)円$/));
  if (parsed.some(part => !part)) return [];
  const amounts = parsed.map(part => Number(part[2].replaceAll(',', '')));
  if (amounts.reduce((a, b) => a + b, 0) !== Math.abs(row.amount)) return [];
  return parsed.map((part, index) => ({ label: part[1], amount: Math.sign(row.amount) * amounts[index] }));
}

function inferCycle(rows) {
  const label = rows.at(-1)?.label || '';
  if (/年間|年額|1年間/.test(label)) return { cycle: 'yearly', basis: '商品名' };
  if (/月額|Monthly/i.test(label)) return { cycle: 'monthly', basis: '商品名' };
  const dates = [...new Set(rows.map(r => r.date))].sort();
  const gaps = dates.slice(1).map((d, i) => dayNumber(d) - dayNumber(dates[i]));
  if (gaps.length >= 2 && gaps.filter(d => d >= 20 && d <= 40).length / gaps.length >= .6) return { cycle: 'monthly', basis: '請求間隔' };
  if (gaps.length && gaps.every(d => d >= 330 && d <= 400)) return { cycle: 'yearly', basis: '請求間隔' };
  return { cycle: 'monthly', basis: '' };
}

const editable = ['name', 'amount', 'cycle', 'category', 'card', 'renewal', 'renewalDay', 'autoRenew', 'startDate', 'endDate', 'plan'];
const copyFields = row => Object.fromEntries(editable.map(k => [k, row[k] ?? '']));

/** A pure view over confirmed card records and verified contract facts.
 * Does not create expenses, write the ledger, or turn missing charges into a cancellation.
 * Facts: id, key, name, channel, observedOn, evidence, cycle?, plan?, status?,
 * canceledOn?, endDate? (last service day), renewal?, amount?, startDate?.
 */
export function reconcileSubscriptions(saved = [], feed, today = subscriptionToday()) {
  if (!feed?.bankSnapshot?.transactions) return saved;
  const cutoff = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const groups = new Map();
  const inputRows = Object.values(feed.bankSnapshot.transactions).filter(r => r && typeof r.description === 'string');
  for (const row of classifyCardRows(inputRows)) {
    if (!row.id?.startsWith('mf-card:') || !iso(row.date) || row.date < cutoff || row.date > today || !Number.isSafeInteger(row.amount)) continue;
    const knownMerchant = /^ヤンマガCLUB$/i.test(row.description) ? 'ヤンマガCLUB' : /^ココデデジタル$/.test(row.description) ? 'FLASH Prime' : /^y\.u mobile サ[ー-]ビス利用料$/i.test(row.description) ? 'y.u mobile' : '';
    for (const part of parts(knownMerchant ? { ...row, subscriptionLabel: knownMerchant } : row)) {
      const identity = subscriptionIdentity(part.label, row.description);
      if (!groups.has(identity.key)) groups.set(identity.key, { ...identity, rows: [], facts: [] });
      groups.get(identity.key).rows.push({ ...row, ...part, plan: identity.plan });
    }
  }
  for (const fact of Object.values(feed.subscriptionContracts || {})) {
    if (!fact?.id || !fact.key || !fact.name || !iso(fact.observedOn) || fact.observedOn > today || !fact.evidence || !['Apple', 'Google', 'PayPal', '直接'].includes(fact.channel)) continue;
    if (!groups.has(fact.key)) groups.set(fact.key, { key: fact.key, name: fact.name, channel: fact.channel, rows: [], facts: [] });
    groups.get(fact.key).facts.push(fact);
  }
  const candidates = [];
  for (const group of groups.values()) {
    group.rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    group.facts.sort((a, b) => a.observedOn.localeCompare(b.observedOn) || a.id.localeCompare(b.id));
    // Only unambiguous full refunds cancel a charge; a refund is never a contract cancellation.
    const refunded = new Set();
    for (const refund of group.rows.filter(r => r.amount > 0)) {
      const matches = group.rows.filter(r => r.amount === -refund.amount && r.account === refund.account && r.date <= refund.date && dayNumber(refund.date) - dayNumber(r.date) <= 45 && !refunded.has(r.id));
      if (matches.length === 1) refunded.add(matches[0].id);
    }
    const charges = group.rows.filter(r => r.amount < 0 && !refunded.has(r.id));
    const last = charges.at(-1);
    const fact = Object.assign({}, ...group.facts);
    if (!last && !group.facts.length) continue;
    const inference = inferCycle(charges);
    const cycle = ['monthly', 'yearly'].includes(fact.cycle) ? fact.cycle : inference.cycle;
    const cycleKnown = !!fact.cycle || !!inference.basis;
    const latestMonth = last?.date.slice(0, 7);
    const latestCharges = charges.filter(r => r.date.slice(0, 7) === latestMonth);
    const multiple = latestCharges.length > 1;
    const lastMonthAmount = latestCharges.reduce((a, r) => a - r.amount, 0);
    const amount = Number.isSafeInteger(fact.amount) && fact.amount >= 0 && (!last || fact.observedOn >= last.date) ? fact.amount : last ? (multiple ? lastMonthAmount : -last.amount) : '';
    const preferredDay = last ? Number(last.date.slice(8)) : undefined;
    let renewal = iso(fact.renewal) && (!last || fact.renewal > last.date) ? fact.renewal : last && cycleKnown && !multiple ? advance(last.date, cycle, preferredDay) : '';
    const canceled = fact.status === 'canceled';
    if (canceled) renewal = '';
    const stale = !!renewal && dayNumber(today) > dayNumber(renewal) + 15;
    const conflict = canceled && last && iso(fact.endDate) && dayNumber(last.date) > dayNumber(fact.endDate) + 7;
    const status = canceled ? 'canceled' : cycleKnown && !stale && !multiple ? 'observed' : 'unconfirmed';
    const plan = fact.plan && (!last || fact.observedOn >= last.date) ? fact.plan : last?.plan || fact.plan || '';
    const row = {
      id: `subscription:${group.key}`, name: fact.name || group.name, amount, cycle, category: 'サブスク',
      card: last?.account || '', renewal, renewalDay: preferredDay, autoRenew: false,
      startDate: fact.startDate || charges[0]?.date || '', endDate: fact.endDate || '', plan,
      subscriptionSync: {
        key: group.key, channel: group.channel, status, cycleKnown,
        cycleBasis: fact.cycle ? '契約情報' : inference.basis, renewalEstimated: !!renewal && renewal !== fact.renewal,
        lastChargedOn: last?.date || '', lastAmount: last ? -last.amount : null,
        canceledOn: fact.canceledOn || '', evidence: group.facts.map(f => f.id), conflict: !!conflict,
        includeInForecast: status === 'observed' && !multiple,
        history: charges.map(r => ({ id: r.id, date: r.date, amount: -r.amount, plan: r.plan || '', card: r.account || '' })).slice(-24),
      },
    };
    row.subscriptionSync.base = copyFields(row);
    candidates.push(row);
  }
  const result = [...saved];
  for (const candidate of candidates) {
    const sameKey = result.findIndex(s => s.subscriptionSync?.key === candidate.subscriptionSync.key);
    const names = result.map((s, i) => !s.subscriptionSync && norm(s.name) === norm(candidate.name) ? i : -1).filter(i => i >= 0);
    const sameNameCandidates = candidates.filter(c => norm(c.name) === norm(candidate.name));
    const index = sameKey >= 0 ? sameKey : names.length === 1 && sameNameCandidates.length === 1 ? names[0] : -1;
    if (index < 0) { result.push(candidate); continue; }
    const old = result[index], base = old.subscriptionSync?.base;
    const merged = { ...old, subscriptionSync: candidate.subscriptionSync };
    for (const field of editable) {
      if (base ? (old[field] ?? '') === (base[field] ?? '') : !old[field]) merged[field] = candidate[field];
    }
    // Confirmed contract termination takes precedence over a pre-sync manual schedule.
    if (!base && candidate.subscriptionSync.status === 'canceled') {
      merged.autoRenew = false; merged.renewal = ''; merged.endDate = candidate.endDate;
    }
    // Existing manual schedules remain forecasts unless a confirmed cancellation says otherwise.
    if (!base && candidate.subscriptionSync.status !== 'canceled') merged.subscriptionSync.includeInForecast = true;
    if (old.cycle && (!base || old.cycle !== base.cycle)) {
      merged.subscriptionSync.cycleKnown = true;
      merged.subscriptionSync.cycleBasis = '手入力';
    }
    if (old.renewal && merged.renewal === old.renewal && (!base || old.renewal !== base.renewal)) merged.subscriptionSync.renewalEstimated = false;
    result[index] = merged;
  }
  return result;
}

export function subscriptionStatus(sub, today = subscriptionToday()) {
  const sync = sub.subscriptionSync;
  if (sync?.conflict) return '終了後の請求あり';
  if (sync?.status === 'canceled') return sub.endDate && sub.endDate >= today ? '解約済み・利用期間中' : '解約済み';
  if (sub.endDate && sub.endDate < today) return '終了';
  if (sync?.status === 'unconfirmed') return '継続未確認';
  return sync ? '請求確認' : '手入力';
}
