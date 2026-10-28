import React from 'react';
import { latestBalances } from '../latest-balances';
import { yen } from '../utils';
import { MUTED } from '../theme';

export function LatestBalances({ feed, accounts }) {
  const rows = latestBalances(feed, accounts || []);
  if (!rows.length || !feed) return null;
  const complete = rows.every(row => row.observation);
  return <section aria-label="銀行の最新残高" style={{ margin: '12px 0', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
    <strong>銀行の最新残高</strong>
    <p style={{ fontSize: 12, color: MUTED }}>銀行で確認できた残高です。表示中の月や手入力の記録とは別に更新します。</p>
    {rows.map(({ account, observation: o, status }) => <div key={account} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{account}</span><strong>{o ? yen(o.amount) : status === 'conflict' ? '要確認' : '未取得'}</strong></div>
      {o && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>確認：{new Date(o.issuedAt || o.receivedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}{status === 'stale' ? ' · 24時間以上更新なし' : ''}</div>}
    </div>)}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}><strong>{complete ? '合計' : '取得済みの合計'}</strong><strong>{yen(rows.reduce((sum, row) => sum + (row.observation?.amount || 0), 0))}</strong></div>
  </section>;
}
