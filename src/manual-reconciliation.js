import { bankTransactions } from './bank-feed';
import { cardPaymentDate, cycleYm } from './utils';

const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const aliases = { view: 'view card', epos: 'epos card' };
const account = name => aliases[norm(name)] || norm(name);

export function compareManual(snapshot, entries, cards, memos, cutoff) {
  const purchases = bankTransactions(snapshot).filter(t => t.id.startsWith('mf-card:'));
  const manual = entries.filter(e => e.cat === 'card' && !e.src && !e.autoKind && !e.imp);
  const bills = manual.map(e => {
    const card = cards.find(c => c.name === e.item);
    const candidates = entries.filter(other => other.cat === 'card' && other.item === e.item && other.ym === e.ym);
    const items = purchases.filter(p => {
      if (account(e.item) !== norm(p.account)) return false;
      const due = cardPaymentDate(p.date, card);
      return due && cycleYm(due, cutoff) === e.ym;
    });
    const sum = -items.reduce((s,p) => s + p.amount, 0);
    return { name: e.item, month: e.ym, amount: Math.abs(e.amount), sum, count: items.length,
      status: !items.length ? '対応明細なし' : candidates.length !== 1 ? '請求が複数・要確認' : sum === Math.abs(e.amount) ? '合計一致' : '差額あり' };
  });
  const keys = new Map();
  const notes = memos.filter(m => m.linkedCard && Number(m.amount) > 0);
  const memoKey = m => JSON.stringify([account(m.linkedCard), m.ym, norm(m.title), Number(m.amount)]);
  for (const m of notes) keys.set(memoKey(m), (keys.get(memoKey(m)) || 0) + 1);
  const matches = notes.map(m => {
    const found = purchases.filter(p => norm(p.account) === account(m.linkedCard) && m.ym === p.date.slice(0,7)
      && -p.amount === Number(m.amount) && norm(m.title) === norm(p.description));
    return {name:m.title, month:m.ym, amount:Number(m.amount), status:found.length === 1 && keys.get(memoKey(m)) === 1 ? '明細一致' : found.length ? '候補が複数' : '対応明細なし'};
  });
  return [...bills,...matches].sort((a,b) => (b.month || '').localeCompare(a.month || ''));
}
