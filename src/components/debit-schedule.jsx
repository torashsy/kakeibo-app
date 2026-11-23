import React, {useMemo, useState} from 'react';
import {yen} from '../utils';
import {debitBreakdown} from '../debit-breakdown';
import './debit-schedule.css';

const shortDate = date => date ? `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}` : '';
const money = amount => `${amount < 0 ? '−' : ''}${yen(Math.abs(amount))}`;

function DebitDetails({bill, context}) {
  const detail = useMemo(()=>debitBreakdown(bill,context),[bill,context]);
  const [showAll,setShowAll] = useState(false);
  const leading = detail.lines.filter(line=>line.amount>0).slice(0,2);
  const parts = [...detail.groups.map(row=>({...row,id:`group:${row.label}`})),
    ...(detail.debtTotal ? [{id:'debt',label:'分割・登録予定',amount:detail.debtTotal}] : []),
    ...detail.fixedLines.map(row=>({...row,id:`fixed:${row.id}`}))];
  const max = Math.max(1,...parts.map(row=>Math.abs(row.amount)));
  const preview = detail.lines.length <= 6 ? detail.lines.length : 3;
  const visible = showAll ? detail.lines : detail.lines.slice(0,preview);
  return <details className="debit-disclosure">
    <summary className="debit-item">
      <span className="debit-card-name">{bill.label} <i className="debit-chevron" aria-hidden="true">›</i><small>{bill.fromFeed ? 'MF予定額' : bill.status === 'confirmed' ? '確定' : '見込み'}</small></span>
      <b>{yen(bill.amount)}</b>
      <span className="debit-preview">{leading.length ? leading.map(line=><span key={line.id}><span>{line.label}</span><span>{money(line.amount)}</span></span>) : <span><span>{detail.debtTotal ? '分割・登録予定' : detail.fixedLines.length ? detail.fixedLines.map(row=>row.label).join('・') : '内訳の取得待ち'}</span></span>}</span>
    </summary>
    <div className="debit-detail">
      <div className="debit-detail-title"><h4>内訳</h4><small>{detail.inferred ? '利用日から推定' : '定期費の予定'}</small></div>
      {!!parts.length && <dl className="debit-composition" aria-label={bill.label+'の内訳（予定）'}>{parts.map(part=><div key={part.id}>
        <dt>{part.label}</dt><dd>{money(part.amount)}</dd>
        <span className="debit-track" aria-hidden="true"><i style={{width:`${100*Math.abs(part.amount)/max}%`}}/></span>
      </div>)}</dl>}
      {detail.difference!==0 && <div className="debit-gap">
        <div className="debit-gap-amount"><span>内訳確認中</span><b>{money(detail.difference)}</b></div>
        <details className="debit-evidence"><summary>確認状況 <i aria-hidden="true">›</i></summary>
          {detail.review ? <><p>{detail.review.note}</p><p>{detail.review.evidenceSummary}</p></>
            : <p>{detail.difference>0 ? '予定額と、取得できた内訳との差額です。' : '利用候補・登録予定の合計が予定額を超えています。'} 請求月のずれや分割への変更などは未照合です。</p>}
        </details>
      </div>}
      {detail.debtLines.some(line=>line.label!=='利用先未登録') && <ul className="debit-plan-items" aria-label="分割・登録予定の内訳">{detail.debtLines.map(line=><li key={line.id}><span>{line.label}</span><b>{money(line.amount)}</b></li>)}</ul>}
      {!!detail.lines.length && <>
        <div className="debit-detail-title debit-merchants-title"><h4>利用先 <small>{detail.lines.length}件</small></h4><small>金額順</small></div>
        <ul className="debit-purchases" aria-label={bill.label+'の利用明細'}>{visible.map(line=><li key={line.id}>
          <time dateTime={line.date}>{shortDate(line.date)}</time>
          <span>{line.label}{bill.label==='SAISON' && <small>{line.account}</small>}</span>
          <b>{line.amount<0 && <small>返金 </small>}{money(line.amount)}</b>
        </li>)}</ul>
        {detail.lines.length>preview && <button className="debit-more" aria-expanded={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?'3件に戻す':`残り${detail.lines.length-preview}件`} <span aria-hidden="true">›</span></button>}
      </>}
    </div>
  </details>;
}

export function DebitSchedule({compact=false,rows,following=[],end,missingCount=0,onOpenCards,cards=[],debt={},subs=[],purchases=[],investments=[],reviews={},cutoff=0}) {
  const [later,setLater] = useState(false);
  const context = useMemo(()=>({cards,debt,subs,purchases,investments,reviews,cutoff,bills:[...rows,...following]}),[cards,debt,subs,purchases,investments,reviews,cutoff,rows,following]);
  const visible = later ? following : rows;
  const dates = [...new Set(visible.map(row=>row.date))].sort();
  const renderDate=date=>{
    const bills=visible.filter(row=>row.date===date);
    return <div className="debit-day" key={date}>
      <div className="debit-date"><time dateTime={date}>{shortDate(date)}</time><b>{yen(bills.reduce((sum,row)=>sum+row.amount,0))}</b></div>
      {bills.map(row=><DebitDetails key={row.id+'|'+row.date} bill={row} context={context}/>)}
    </div>;
  };
  const remaining=visible.filter(row=>row.date!==dates[0]);
  return <section className="debit-schedule" data-compact={compact} aria-label="引き落とし予定">
    <header><h3>引き落とし予定</h3><strong>{yen(visible.reduce((sum,row)=>sum+row.amount,0))}</strong></header>
    <div className="debit-period" role="group" aria-label="引落予定の期間">
      <button aria-pressed={!later} onClick={()=>setLater(false)}>{shortDate(end)}まで</button>
      <button aria-pressed={later} onClick={()=>setLater(true)}>次月分</button>
    </div>
    <div key={later?'following':'current'}>{(compact?dates.slice(0,1):dates).map(renderDate)}
      {compact&&dates.length>1&&<details className="later-debits">
        <summary><span>その後の予定 <small>{remaining.length}件</small> <i aria-hidden="true">›</i></span><b>{yen(remaining.reduce((sum,row)=>sum+row.amount,0))}</b></summary>
        {dates.slice(1).map(renderDate)}
      </details>}
    </div>
    {!visible.length && <p className="debit-empty">予定額はまだありません</p>}
    {missingCount>0 && <button className="debit-empty" onClick={onOpenCards}>引落日未設定 {missingCount}枚 ›</button>}
  </section>;
}
