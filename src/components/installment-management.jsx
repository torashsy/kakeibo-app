import React from 'react';
import {yen,debtValueTotal} from '../utils';
import './deadlines.css';
export function InstallmentManagement({debt,cards,reviews=[],collection,ym}) {
  const rows=cards.filter(c=>Object.keys(debt[c.name]||{}).length||reviews.some(r=>r.card===c.name));
  return <section className="deadline-section installment-management" aria-label="分割払いの自動照合">
    <header><h2>分割払いの照合</h2><span>{collection?.checkedAt?`${collection.checkedAt.slice(0,10).replaceAll('-','/')}確認`:'資料待ち'}</span></header>
    <ul className="deadline-list point-balances">{rows.map(card=>{
      const checks=reviews.filter(r=>r.card===card.name&&r.ym>=ym);
      const issue=checks.find(r=>r.status==='conflict'||r.status==='review');
      const ok=checks.filter(r=>['synced','matched'].includes(r.status));
      const cell=debt[card.name]?.[ym];
      return <li key={card.id} className="installment-status-row"><span className="deadline-name">{card.name}<small>{issue?.reason|| (ok.length?`${ok.length}か月分を照合済み`:'手入力を保持・支払予定明細待ち')}</small></span><b className="deadline-value">{cell==null?'—':yen(debtValueTotal(cell))}<small>{Number(ym.slice(5))}月度</small></b></li>;
    })}</ul>
    {!!collection?.issues?.length&&<details className="installment-issues"><summary>確認待ち <span aria-hidden="true">›</span></summary>{collection.issues.map((i,n)=><p key={n}>{i.card||i.source}：{i.reason}</p>)}</details>}
  </section>;
}
