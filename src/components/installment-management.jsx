import React from 'react';
import {yen,debtValueTotal} from '../utils';
import {installmentPreviews} from '../installment-sync';
import './deadlines.css';
export function InstallmentManagement({debt,cards,reviews=[],collection,ym,cutoff=0}) {
  const previews=installmentPreviews(collection,cards,debt,cutoff).filter(s=>s.manualYm>=ym);
  const rows=cards.filter(c=>Object.keys(debt[c.name]||{}).length||reviews.some(r=>r.card===c.name));
  return <section className="deadline-section installment-management" aria-label="分割払いの自動照合">
    <header><h2>分割払いの照合</h2><span>{collection?.checkedAt?`${collection.checkedAt.slice(0,10).replaceAll('-','/')}確認`:'資料待ち'}</span></header>
    <ul className="deadline-list point-balances">{rows.map(card=>{
      const checks=reviews.filter(r=>r.card===card.name&&r.ym>=ym);
      const issue=checks.find(r=>r.status==='conflict'||r.status==='review');
      const ok=checks.filter(r=>['synced','matched'].includes(r.status));
      const cell=debt[card.name]?.[ym];
      const pending=previews.filter(s=>s.card===card.name);
      return <li key={card.id} className="installment-status-row"><span className="deadline-name">{card.name}<small>{issue?.reason|| (pending.length?`${pending.length}か月分の内訳取得・未確定`:ok.length?`${ok.length}か月分を照合済み`:'手入力を保持・支払予定明細待ち')}</small></span><b className="deadline-value">{cell==null?'—':yen(debtValueTotal(cell))}<small>{Number(ym.slice(5))}月度・登録額</small></b></li>;
    })}</ul>
    {previews.map(s=><div key={s.id} className="installment-preview">
      <header><span>{s.card}<small>{s.date.replaceAll('-','/')} 引落予定・未確定</small></span><b>{yen(s.amount)}<small>分割・スキップ分</small></b></header>
      {s.difference!==null&&<p className="installment-difference">{s.supplement?.addedCount?`${s.supplement.addedCount}件・${yen(s.supplement.addedAmount)}を見込みに補完`:s.difference===0?'登録額と一致':`登録額との差 ${s.difference>0?'+':'−'}${yen(Math.abs(s.difference))}`}<small>{s.supplement?'請求確定時に再照合':'登録額は保持'}</small></p>}
      <details className="installment-issues"><summary>内訳 {s.items.length}件 <span aria-hidden="true">›</span></summary><ul className="installment-item-list">{s.items.map(i=><li key={i.id}><span>{i.label}<small>{i.purchaseDate.slice(5).replace('-','/')} · {i.paymentType==='skip'?'スキップ払い':`${i.installmentNumber}/${i.totalInstallments}回`}</small></span><b>{yen(i.amount)}</b></li>)}</ul><small>{s.asOf.replaceAll('-','/')}確認・手数料込み</small></details>
    </div>)}
    {Object.values(collection?.summaries||{}).map(s=><details key={s.id} className="installment-issues"><summary>{s.card} の支払予定表 <span aria-hidden="true">›</span></summary><small>{s.asOf?.replaceAll('-','/')}発行・以後の新規利用を除く</small><table className="installment-source-table"><thead><tr><th>支払月</th><th>分割等の予定額</th><th>支払後の残額</th></tr></thead><tbody>{s.months.map(row=><tr key={row.paymentMonth}><td>{row.paymentMonth.replace('-','/')}</td><td>{yen(row.amount)}</td><td>{yen(row.remaining)}</td></tr>)}</tbody></table></details>)}
    {!!collection?.issues?.length&&<details className="installment-issues"><summary>確認待ち <span aria-hidden="true">›</span></summary>{collection.issues.map((i,n)=><p key={n}>{i.card||i.source}：{i.reason}</p>)}</details>}
  </section>;
}
