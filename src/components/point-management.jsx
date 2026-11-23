import React from 'react';
import {pointManagement} from '../point-management';
export function PointManagement({points,collection,checks}) {
  const rows=pointManagement(points,collection,checks);
  const n=x=>x.toLocaleString('ja-JP');
  return <section className="deadline-section point-management" aria-label="必須ポイントの管理状況">
    <header><h2>管理状況</h2><span>6サービス</span></header>
    {rows.map(s=><details key={s.id} className="point-service"><summary>
      <span>{s.name}<small>{s.status}{s.unknown>0?' · 期限の一部未確認':''}</small></span>
      <strong>{s.amount===null?'—':n(s.amount)}<small>{s.unit==='mile'?'マイル':'pt'}</small></strong><span aria-hidden="true" className="point-service-chevron">›</span>
    </summary><div className="point-service-details">
      <p>{s.asOf?`${s.asOf.replaceAll('-','/')}時点`:'取得日未確認'}{s.reason?` · ${s.reason}`:''}</p>
      {s.linkedIssue&&<p>V会員番号側：{s.linkedIssue}</p>}
      {!!s.expiries.length&&<dl>{s.expiries.map(p=><div key={p.id}><dt>{p.expiresOn.replaceAll('-','/')}まで</dt><dd>{n(p.amount)} {s.unit==='mile'?'マイル':'pt'}</dd></div>)}</dl>}
      {!!s.unknown&&<p>期限未確認 {n(s.unknown)} {s.unit==='mile'?'マイル':'pt'}</p>}
      {s.expiryCheck&&<div className="point-expiry-evidence"><p>期限の通知 · {s.expiryCheck.asOf.replaceAll('-','/')}時点</p><dl>{s.expiryCheck.expiries.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&Number.isSafeInteger(e.amount)&&e.amount>=0).map(e=><div key={e.date}><dt>{e.date.replaceAll('-','/')}まで失効</dt><dd>{n(e.amount)} {s.unit==='mile'?'マイル':'pt'}</dd></div>)}</dl></div>}
    </div></details>)}
  </section>;
}
