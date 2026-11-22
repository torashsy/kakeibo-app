import React, {useMemo, useState} from 'react';
import {yen} from '../utils';
import {debitBreakdown} from '../debit-breakdown';
import './debit-schedule.css';

const shortDate = date => date ? `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}` : '';
const signed = amount => `${amount < 0 ? '−' : '+'}${yen(Math.abs(amount))}`;

function DebitDetails({bill, context}) {
  const detail = useMemo(()=>debitBreakdown(bill,context),[bill,context]);
  const [showAll,setShowAll] = useState(false);
  const leading = detail.lines.filter(line=>line.amount>0).slice(0,2);
  const max = Math.max(1,...detail.groups.map(row=>Math.abs(row.amount)));
  const preview = detail.lines.length <= 6 ? detail.lines.length : 3;
  const visible = showAll ? detail.lines : detail.lines.slice(0,preview);
  return <details className="debit-disclosure">
    <summary className="debit-item">
      <span className="debit-card-name">{bill.label}<small>{bill.fromFeed ? 'MF予定額' : bill.status === 'confirmed' ? '確定' : '見込み'} · 内訳 <i aria-hidden="true">›</i></small></span>
      <b>{yen(bill.amount)}</b>
      <span className="debit-preview">{leading.length ? leading.map(line=>`${line.label} ${yen(line.amount)}`).join(' / ') : detail.debtTotal ? `分割・登録予定 ${yen(detail.debtTotal)}` : detail.fixedLines.length ? detail.fixedLines.map(row=>row.label).join('・') : '内訳の取得待ち'}</span>
    </summary>
    <div className="debit-detail">
      {!!detail.lines.length && <>
        <div className="debit-detail-title"><h4>{bill.fromFeed || bill.status === 'confirmed' ? '対象の利用候補' : '利用明細'}</h4><small>金額順 · 利用日から推定</small></div>
        {detail.groups.length>1 && <div className="debit-categories" aria-label="利用候補の用途別金額">{detail.groups.map(group=><div key={group.label}>
          <span>{group.label}</span><b>{group.amount<0?'−':''}{yen(Math.abs(group.amount))}</b>
          <i aria-hidden="true" style={{width:`${100*Math.abs(group.amount)/max}%`}}/>
        </div>)}</div>}
        <ul className="debit-purchases" aria-label={bill.label+'の利用明細'}>{visible.map(line=><li key={line.id}>
          <time dateTime={line.date}>{shortDate(line.date)}</time>
          <span>{line.label}{bill.label==='SAISON' && <small>{line.account}</small>}</span>
          <b>{line.amount<0 && <small>返金 </small>}{signed(line.amount)}</b>
        </li>)}</ul>
        {detail.lines.length>preview && <button className="debit-more" aria-expanded={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?'3件に戻す':`残り${detail.lines.length-preview}件`} <span aria-hidden="true">›</span></button>}
      </>}
      <dl className="debit-reconcile">
        {!!detail.lines.length && <div><dt>利用・返金{detail.groups.some(row=>row.label==='カード積立')?'・積立':''}</dt><dd>{signed(detail.purchaseTotal)}</dd></div>}
        {!!detail.debtTotal && <div><dt>分割・登録予定</dt><dd>{signed(detail.debtTotal)}</dd></div>}
        {detail.fixedLines.map(line=><div key={line.id}><dt>{line.label}<small>定期費の予定</small></dt><dd>{signed(line.amount)}</dd></div>)}
        {detail.difference!==0 && <div className="debit-gap"><dt>内訳未照合</dt><dd>{signed(detail.difference)}</dd></div>}
        <div className="debit-detail-total"><dt>引き落とし予定</dt><dd>{yen(bill.amount)}</dd></div>
      </dl>
      {detail.debtLines.length>0 && <div className="debit-plan-items">{detail.debtLines.some(line=>line.label!=='利用先未登録')
        ? detail.debtLines.map(line=><div key={line.id}><span>{line.label}</span><b>{yen(line.amount)}</b></div>)
        : <p>分割・登録予定は利用先の記録なし</p>}</div>}
      {detail.difference!==0 && <p className="debit-gap-note">{detail.difference>0 ? '予定額のうち、内訳と結びついていない金額。' : '利用候補・登録予定の合計が予定額を超えています。'} 請求月のずれ・分割への変更などは未照合です。</p>}
      {!!detail.lines.length && (bill.fromFeed || bill.status==='confirmed') && <p className="debit-gap-note">利用候補は締め日による推定。請求への反映は未照合です。</p>}
    </div>
  </details>;
}

export function DebitSchedule({rows,following=[],end,missingCount=0,onOpenCards,cards=[],debt={},subs=[],purchases=[],investments=[],cutoff=0}) {
  const [later,setLater] = useState(false);
  const context = useMemo(()=>({cards,debt,subs,purchases,investments,cutoff,bills:[...rows,...following]}),[cards,debt,subs,purchases,investments,cutoff,rows,following]);
  const visible = later ? following : rows;
  const dates = [...new Set(visible.map(row=>row.date))];
  return <section className="debit-schedule" aria-label="引き落とし予定">
    <header><h3>引き落とし予定</h3><strong>{yen(visible.reduce((sum,row)=>sum+row.amount,0))}</strong></header>
    <div className="debit-period" role="group" aria-label="引落予定の期間">
      <button aria-pressed={!later} onClick={()=>setLater(false)}>{shortDate(end)}まで</button>
      <button aria-pressed={later} onClick={()=>setLater(true)}>次月分</button>
    </div>
    <div key={later?'following':'current'}>{dates.map(date=>{
      const bills=visible.filter(row=>row.date===date);
      return <div className="debit-day" key={date}>
        <div className="debit-date"><time dateTime={date}>{shortDate(date)}</time><b>{yen(bills.reduce((sum,row)=>sum+row.amount,0))}</b></div>
        {bills.map(row=><DebitDetails key={row.id+'|'+row.date} bill={row} context={context}/>)}
      </div>;
    })}</div>
    {!visible.length && <p className="debit-empty">予定額はまだありません</p>}
    {missingCount>0 && <button className="debit-empty" onClick={onOpenCards}>引落日未設定 {missingCount}枚 ›</button>}
  </section>;
}
