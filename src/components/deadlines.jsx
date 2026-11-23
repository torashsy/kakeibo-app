import React,{useState} from 'react';
import {deadlineEvents,daysBetween,localDay,normalizePoints,validDay} from '../deadlines';
import {yen,uid} from '../utils';
import {EntrySheet} from './entry-sheet';
import './deadlines.css';

const count=n=>Number(n).toLocaleString('ja-JP');
const pointUnit=p=>p.unit==='mile'?'マイル':p.unit==='yenEquivalent'?'円相当':'pt';
const eventAmount=e=>e.unit==='yen'?yen(e.amount):`${count(e.amount)} ${pointUnit(e)}`;
const relative=days=>days<0?`${-days}日経過`:days===0?'今日':`あと${days}日`;
export function Deadlines({points=[],subs=[],onSavePoints,onEditSub,mode='all'}) {
  const [edit,setEdit]=useState(null),[range,setRange]=useState('soon'),[showUsed,setShowUsed]=useState(false),[deleteId,setDeleteId]=useState(null);
  const today=localDay(),all=normalizePoints(points).filter(p=>!p.hidden);
  const events=deadlineEvents(subs,all,today),visible=events.filter(e=>range==='all'||e.days<=30);
  const balances=all.filter(p=>p.kind!=='benefit'&&(showUsed||p.status!=='used'));
  const benefits=all.filter(p=>p.kind==='benefit'&&(showUsed||p.status!=='used'));
  const undated=subs.filter(s=>!s.hidden&&s.subscriptionSync?.status!=='canceled'&&(!s.endDate||s.endDate>=today)&&![s.renewal,s.trialEndDate,s.cancelBy,s.endDate].some(validDay));
  const save=()=>{
    const amount=String(edit.amount).trim();
    if(!edit.name.trim()||!/^\d+$/.test(amount)||!Number.isSafeInteger(Number(amount))||(edit.expiryMode==='date'&&!validDay(edit.expiresOn)))return;
    const next={...edit,id:edit.id||uid(),name:edit.name.trim(),amount:Number(amount),expiresOn:edit.expiryMode==='date'?edit.expiresOn:'',updatedOn:today};
    onSavePoints(edit.id?points.map(p=>p.id===edit.id?next:p):[...points,next]);setEdit(null);
  };
  const canSave=edit && edit.name.trim() && /^\d+$/.test(String(edit.amount).trim()) && Number.isSafeInteger(Number(edit.amount)) && (edit.expiryMode!=='date'||validDay(edit.expiresOn));
  return <div className="deadline-manager">
    <section className="deadline-section"><header><h2>{mode==='points'?'ポイント・特典の期限':'期限・更新日'}</h2><span>{visible.length}件</span></header>
      <div className="deadline-filter" role="group" aria-label="期限の表示期間">{[['soon','30日以内'],['all','すべて']].map(([id,label])=><button key={id} aria-pressed={range===id} onClick={()=>setRange(id)}>{label}</button>)}</div>
      {visible.length?<ul className="deadline-list">{visible.map(event=><li key={event.id}><button onClick={()=>event.source==='point'?setEdit(all.find(p=>p.id===event.sourceId)):onEditSub(event.sourceId)}>
        <time dateTime={event.date}><b>{Number(event.date.slice(5,7))}/{Number(event.date.slice(8))}</b><small>{event.date.slice(0,4)}</small></time>
        <span className="deadline-name">{event.name}<small>{event.kind}</small></span>
        <span className="deadline-value">{event.amount!=null && <b>{eventAmount(event)}</b>}<small data-urgent={event.days<=7}>{relative(event.days)}</small></span>
      </button></li>)}</ul>:<p className="deadline-empty">この期間の予定はありません</p>}
    </section>
    {mode!=='subscriptions'&&<section className="deadline-section"><header><h2>ポイント・マイル</h2><button aria-label="＋ ポイントを追加" className="deadline-add" onClick={()=>setEdit({name:'',amount:'',expiresOn:'',expiryMode:'unknown',status:'active',unit:'pt',note:''})}>＋ 追加</button></header>
      {balances.length?<ul className="deadline-list point-balances">{balances.map(point=>{
        const days=daysBetween(point.expiresOn,today);
        const expiry=point.status==='used'?'利用済み':point.expiryMode==='none'?'期限なし':point.expiryMode==='unknown'?'期限未確認':`${point.expiresOn.replaceAll('-','/')}まで${days<0?' · 期限切れ':''}`;
        return <li key={point.id}><button onClick={()=>setEdit({...point,amount:String(point.amount)})}><span className="deadline-name">{point.name}<small>{expiry}</small>{point.pointSync&&<small>{point.pointSync.asOf.replaceAll('-','/')}時点</small>}{point.note&&<small>{point.note}</small>}</span><b className="deadline-value">{count(point.amount)} <small>{pointUnit(point)}</small></b></button></li>;
      })}</ul>:<p className="deadline-empty">ポイントはまだ登録されていません</p>}
      {all.some(p=>p.status==='used')&&<button className="deadline-add" aria-pressed={showUsed} onClick={()=>setShowUsed(!showUsed)}>{showUsed?'利用済みを隠す':'利用済みも表示'}</button>}
    </section>}
    {!!benefits.length&&<section className="deadline-section"><header><h2>特典の受け取り</h2><span>残高には含めません</span></header><ul className="deadline-list point-balances">{benefits.map(p=><li key={p.id}><button onClick={()=>setEdit({...p,amount:String(p.amount)})}><span className="deadline-name">{p.name}<small>{p.status==='used'?'受取済み':'受取状況未確認'}{p.expiresOn?` · ${p.expiresOn.replaceAll('-','/')}まで`:''}</small>{p.pointSync&&<small>{p.pointSync.asOf.replaceAll('-','/')}通知</small>}</span><b className="deadline-value">{count(p.amount)} <small>{pointUnit(p)}</small></b></button></li>)}</ul></section>}
    {!!undated.length&&<section className="deadline-section"><header><h2>更新日が未登録</h2><span>{undated.length}件</span></header><ul className="deadline-list point-balances">{undated.map(s=><li key={s.id}><button onClick={()=>onEditSub(s.id)}><span className="deadline-name">{s.name}</span><span aria-hidden="true">›</span></button></li>)}</ul></section>}
    {edit&&<EntrySheet portal label="ポイントを編集" onClose={()=>setEdit(null)}><form className="deadline-editor" onSubmit={e=>{e.preventDefault();save();}}>
      <header><h2>{edit.id?'ポイントを編集':'ポイントを追加'}</h2><button type="button" onClick={()=>setEdit(null)}>閉じる</button></header>
      <label>サービス名<input autoFocus required value={edit.name} placeholder="例：Vポイント" onChange={e=>setEdit({...edit,name:e.target.value})}/></label>
      <label>残りポイント<input required inputMode="numeric" pattern="[0-9]+" value={edit.amount} onChange={e=>setEdit({...edit,amount:e.target.value})}/></label>
      <label>単位<select value={edit.unit||'pt'} onChange={e=>setEdit({...edit,unit:e.target.value})}><option value="pt">ポイント</option><option value="mile">マイル</option><option value="yenEquivalent">円相当</option></select></label>
      <label>有効期限<select aria-label="有効期限" value={edit.expiryMode} onChange={e=>setEdit({...edit,expiryMode:e.target.value})}><option value="date">日付を指定</option><option value="none">期限なし</option><option value="unknown">未確認</option></select></label>
      {edit.expiryMode==='date'&&<label>期限日<input required type="date" value={edit.expiresOn} onInput={e=>setEdit({...edit,expiresOn:e.currentTarget.value})} onChange={e=>setEdit({...edit,expiresOn:e.target.value})}/></label>}
      <label>メモ<input value={edit.note||''} placeholder="期間限定分など" onChange={e=>setEdit({...edit,note:e.target.value})}/></label>
      <button className="deadline-save" disabled={!canSave}>保存</button>
      {edit.id&&<button type="button" onClick={()=>{onSavePoints(points.map(p=>p.id===edit.id?{...p,status:p.status==='used'?'active':'used',updatedOn:today}:p));setEdit(null);}}>{edit.status==='used'?'未処理に戻す':edit.kind==='benefit'?'受取済みにする':'利用済みにする'}</button>}
      {edit.id&&(deleteId===edit.id?<div role="group" aria-label="ポイントの削除確認"><span>この記録を削除しますか？</span><button type="button" onClick={()=>{onSavePoints(edit.pointSync?points.map(p=>p.id===edit.id?{...p,hidden:true}:p):points.filter(p=>p.id!==edit.id));setEdit(null);setDeleteId(null);}}>削除する</button><button type="button" onClick={()=>setDeleteId(null)}>戻る</button></div>:<button type="button" onClick={()=>setDeleteId(edit.id)}>記録を削除</button>)}
    </form></EntrySheet>}
  </div>;
}
