import React from 'react';
import { latestBalances } from '../latest-balances';
import { yen } from '../utils';
import { MUTED } from '../theme';

export function LatestBalances({ feed, accounts }) {
  const rows = latestBalances(feed, accounts || []);
  if (!rows.length || !feed) return null;
  const complete = rows.every(row => row.observation);
  return <section aria-label="銀行の最新残高" style={{ margin: '12px 0', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
    <details className="bank-balances"><summary className="amount-summary"><span>{complete ? '最新の口座残高' : '取得済みの口座残高'}</span><strong>{yen(rows.reduce((sum,row) => sum + (row.observation?.amount || 0), 0))}</strong></summary>
    {rows.map(({ account, observation: o, status }) => <div key={account} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{account}</span><strong>{o ? yen(o.amount) : status === 'conflict' ? '要確認' : '未取得'}</strong></div>
      {o && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>確認：{new Date(o.issuedAt || o.receivedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}{status === 'stale' ? ' · 24時間以上更新なし' : ''}</div>}
    </div>)}
    </details>
  </section>;
}
