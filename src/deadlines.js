import { rollForwardSubs } from './utils';

export const localDay = () => {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export function validDay(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0,10)===value;
}
export const daysBetween = (day,today=localDay()) => validDay(day) && validDay(today)
  ? Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000) : null;

export function normalizePoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(p=>p && typeof p.name==='string' && p.name.trim() && p.amount!=='' && p.amount!=null && Number.isFinite(Number(p.amount)) && Number(p.amount)>=0).map((p,i)=>({
    ...p,id:String(p.id || `point-${i}`),name:p.name.trim(),amount:Math.round(Number(p.amount)),
    expiresOn:validDay(p.expiresOn)?p.expiresOn:'',
    expiryMode:validDay(p.expiresOn)?'date':p.expiryMode==='none'?'none':'unknown',
    status:p.status==='used'?'used':'active',note:typeof p.note==='string'?p.note:'',
  }));
}

// Dates describe reminders only; they never create spending or convert points to yen.
export function deadlineEvents(subs=[],points=[],today=localDay()) {
  const events=[];
  const add=(date,item)=>{if(validDay(date))events.push({...item,date,days:daysBetween(date,today)});};
  for(const sub of rollForwardSubs(subs,today)) {
    if(sub.endDate && sub.endDate<today)continue;
    const common={name:sub.name,source:'sub',sourceId:sub.id,amount:sub.amount,unit:'yen'};
    if(!sub.endDate || sub.renewal<=sub.endDate)add(sub.renewal,{...common,id:`renewal:${sub.id}`,kind:sub.autoRenew===false?'更新予定':'自動更新'});
    add(sub.trialEndDate,{...common,id:`trial:${sub.id}`,kind:'無料期間終了',amount:null});
    add(sub.cancelBy,{...common,id:`cancel:${sub.id}`,kind:'解約期限',amount:null});
    add(sub.endDate,{...common,id:`end:${sub.id}`,kind:'契約終了',amount:null});
  }
  for(const point of normalizePoints(points)) {
    if(point.status==='used'||point.amount===0)continue;
    add(point.expiresOn,{id:`point:${point.id}`,source:'point',sourceId:point.id,name:point.name,kind:'ポイント期限',amount:point.amount,unit:'pt'});
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id));
}
