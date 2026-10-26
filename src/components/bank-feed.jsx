import React, { useMemo, useState } from 'react';
import { bankTransactions } from '../bank-feed';
import { yen } from '../utils';
import { MUTED } from '../theme';

export function BankFeed({ snapshot }) {
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(30);
  const transactions = useMemo(() => bankTransactions(snapshot), [snapshot]);
  if (!transactions.length) return null;
  const filtered = transactions.filter(t => !filter || `${t.account || ''} ${t.source} ${t.description} ${t.date}`.toLowerCase().includes(filter.toLowerCase()));
  return <section aria-label="銀行・カードの取得明細" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
    <strong>銀行・カードの取得明細</strong>
    <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.7 }}>{snapshot.coverage}<br />取得した明細をそのまま保存しています。カード利用と口座引落、口座間振替を含むため、この一覧の合計は家計の収支に加算しません。口座名がない明細は取得元で口座を特定できていません。</p>
    <input aria-label="取得明細を検索" placeholder="日付・摘要・口座で検索" value={filter} onChange={e => { setFilter(e.target.value); setLimit(30); }} style={{ width: '100%', boxSizing: 'border-box', padding: 10, marginBottom: 8 }} />
    <div style={{ fontSize: 12, color: MUTED }}>{filtered.length}件</div>
    {filtered.slice(0, limit).map(t => <article key={t.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
      <div style={{ fontSize: 12, color: MUTED }}>{t.date} · {t.account || t.source}</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 4 }}><span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{t.description}</span><strong style={{ whiteSpace: 'nowrap', color: t.amount < 0 ? 'var(--expense)' : 'var(--income)' }}>{t.amount > 0 ? '+' : ''}{yen(t.amount)}</strong></div>
      {t.balance !== undefined && <div style={{ fontSize: 12, color: MUTED }}>取引後残高 {yen(t.balance)}</div>}
    </article>)}
    {filtered.length > limit && <button type="button" onClick={() => setLimit(limit + 50)} style={{ marginTop: 10, padding: 10 }}>さらに50件表示</button>}
  </section>;
}
