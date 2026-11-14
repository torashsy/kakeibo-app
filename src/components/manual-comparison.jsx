import React, { useMemo } from 'react';
import { compareManual } from '../manual-reconciliation';
import { yen } from '../utils';

export function ManualComparison({snapshot, ledger}) {
  const rows = useMemo(() => ledger ? compareManual(snapshot, ledger.entries, ledger.cards, ledger.memos, ledger.cutoff, ledger.debt) : [], [snapshot,ledger]);
  if (!ledger || !rows.length) return null;
  return <details style={{margin:'12px 0'}}><summary>手入力との照合（{rows.length}件）</summary>
    <p>収支にはカード請求を計上します。利用明細とメモは内訳として表示します。請求はカードの締め日と支払日で照合します。</p>
    {rows.map((r,i) => <div key={i} style={{padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
      {r.month}　{r.name}　{yen(r.amount)} · {r.status}
      {r.installments > 0 && <small style={{display:"block"}}>登録済みの分割支払予定 {yen(r.installments)} · {r.installments === r.amount ? "手入力額と一致" : "分割分を除いた請求額 " + yen(r.amount - r.installments)}</small>}
      {r.count > 0 && r.installments > 0 && r.amount === r.sum + r.installments && <small>利用明細と分割予定の合計が手入力額に一致</small>}
      {r.settlement && <small style={{display:'block'}}>銀行支払額一致：{r.settlement.date}　{r.settlement.bank}　{r.settlement.method}　{yen(r.settlement.amount)}</small>}
      {r.count > 0 && <small style={{display:'block'}}>利用明細 {r.count}件　{yen(r.sum)}（差額 {yen(r.amount-r.sum)}）</small>}
    </div>)}
  </details>;
}
