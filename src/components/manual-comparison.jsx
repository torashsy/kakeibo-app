import React, { useMemo } from 'react';
import { compareManual } from '../manual-reconciliation';
import { yen } from '../utils';

export function ManualComparison({snapshot, ledger}) {
  const rows = useMemo(() => ledger ? compareManual(snapshot, ledger.entries, ledger.cards, ledger.memos, ledger.cutoff) : [], [snapshot,ledger]);
  if (!ledger || !rows.length) return null;
  return <details style={{margin:'12px 0'}}><summary>手入力との照合（{rows.length}件）</summary>
    <p>収支にはカード請求を計上します。利用明細とメモは内訳として表示します。請求はカードの締め日と支払日で照合します。</p>
    {rows.map((r,i) => <div key={i} style={{padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
      {r.month}　{r.name}　{yen(r.amount)} · {r.status}
      {r.settlement && <small style={{display:'block'}}>銀行支払額一致：{r.settlement.date}　{r.settlement.bank}　{r.settlement.method}　{yen(r.settlement.amount)}</small>}
      {r.count > 0 && <small style={{display:'block'}}>利用明細 {r.count}件　{yen(r.sum)}（差額 {yen(r.amount-r.sum)}）</small>}
    </div>)}
  </details>;
}
