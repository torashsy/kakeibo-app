import React from 'react';
import { auditedCardInventory } from '../card-inventory';
import { yen } from '../utils';

const statusLabel={activity:'利用・請求記録',linked:'連携のみ',issued:'発行記録のみ',registered:'登録のみ',closed:'解約済み',ended:'サービス終了',replaced:'切替元'};
const dateText=value=>value?.slice(0,10).replaceAll('-','/')||'日付未確認';
const safeLink=value=>typeof value==='string'&&/^https:\/\//.test(value)?value:undefined;

export function CardContracts({audit,transactions}){
  const view=auditedCardInventory(audit,transactions);
  if(!view.records.length)return null;
  const renderCard=c=><li key={c.id} className="contract-row">
    <div className="contract-title"><strong>{c.name}</strong><span>{c.fee?.label||'年会費未確認'}</span></div>
    <div className="contract-meta"><span>{c.brand||'ブランド未確認'} · {statusLabel[c.status]||'保有未確認'}</span><time>{dateText(c.lastActivity||c.evidenceDate)}</time></div>
    {c.fee?.condition&&<p className="contract-condition">{c.fee.condition}</p>}
    {c.fee?.serviceFee&&<p className="contract-service">未利用時 {yen(c.fee.serviceFee.amount)} · {c.fee.serviceFee.summary}</p>}
    <details className="contract-evidence"><summary><span className="contract-chevron">›</span>確認した内容</summary>
      {c.note&&<p>{c.note}</p>}
      {c.fee?.assessment&&<p>{c.fee.assessment}</p>}
      {c.fee?.serviceFee?.assessment&&<p>{c.fee.serviceFee.assessment}</p>}
      {c.ledgerName&&<p>家計簿の集計名：{c.ledgerName}</p>}
      {c.evidence?.map((e,i)=><p key={i}>{safeLink(e.url)?<a href={e.url} target="_blank" rel="noopener noreferrer">{e.label}</a>:e.label}{e.date&&` · ${dateText(e.date)}`}</p>)}
      {safeLink(c.fee?.url)&&<p><a href={c.fee.url} target="_blank" rel="noopener noreferrer">公式の年会費・条件</a></p>}
    </details>
  </li>;
  return <section className="card-contracts" aria-label="カードの保有状況">
    <div className="contract-counts"><div><span>利用・請求の記録</span><strong>{view.used.length}<small>種類</small></strong></div><div><span>保有確認待ち</span><strong>{view.pending.length}<small>種類</small></strong></div></div>
    <p className="card-inventory-hint">{dateText(audit.checkedAt)}調査 · 現在の保有総数は未確定</p>
    {[...new Set(view.used.map(c=>c.issuer))].map(issuer=><section key={issuer}><h3>{issuer}</h3><ul>{view.used.filter(c=>c.issuer===issuer).map(renderCard)}</ul></section>)}
    {!!view.pending.length&&<section><h3>保有を確認したいカード</h3><ul>{view.pending.map(renderCard)}</ul></section>}
    {!!audit.issues?.length&&<section className="contract-issues"><h3>対応が未確定の記録</h3><ul>{audit.issues.map(issue=><li key={issue.id}><strong>{issue.title}</strong><p>{issue.detail}</p></li>)}</ul></section>}
    {!!view.closed.length&&<details className="card-inventory-sources"><summary><span><span className="contract-chevron">›</span>解約・終了・切替の記録</span><span>{view.closed.length}件</span></summary><ul>{view.closed.map(renderCard)}</ul></details>}
  </section>;
}
