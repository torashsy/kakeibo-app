import {cycleYm,cardPaymentDate,cardForPurchase,debtValueTotal,nextBankBusinessDay} from './utils';
import {localDay,validDay} from './deadlines';
const nominalMonth=(source,cards,cutoff)=>{
  const card=cards.find(c=>c.name===source.card);
  return cycleYm(`${source.date.slice(0,7)}-${String(card?.paymentDay||Number(source.date.slice(8))).padStart(2,'0')}`,cutoff);
};

// Provisional issuer statements remain forecasts, never ledger transactions.
export function installmentPreviews(collection,cards=[],saved={},cutoff=0,today=localDay()) {
  return Object.values(collection?.statements||{}).filter(s=>{
    const ids=new Set();
    return s.kind==='issuer-itemized-preview'&&s.confirmed===false&&s.complete===true&&s.evidence&&validDay(s.asOf)&&s.asOf<=today&&validDay(s.date)&&cards.some(c=>c.name===s.card)&&
      ['amount','ordinaryAmount','statementTotal'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&Array.isArray(s.items)&&s.items.length>0&&s.items.every(i=>{
        if(!i.id||ids.has(i.id)||!i.label?.trim()||!Number.isSafeInteger(i.amount)||i.amount<0||!validDay(i.purchaseDate)||i.purchaseDate>s.date||!['skip','installment'].includes(i.paymentType)||!Number.isInteger(i.installmentNumber)||!Number.isInteger(i.totalInstallments)||i.installmentNumber<1||i.installmentNumber>i.totalInstallments)return false;
        ids.add(i.id);return true;
      })&&s.items.reduce((n,i)=>n+i.amount,0)===s.amount&&s.amount+s.ordinaryAmount===s.statementTotal;
  }).map(s=>{
    const card=cards.find(c=>c.name===s.card);
    // Legacy manual cells use the nominal payment day. A holiday-shifted date
    // must not compare January's bill with a different month's manual entry.
    const ym=cycleYm(`${s.date.slice(0,7)}-${String(card.paymentDay||Number(s.date.slice(8))).padStart(2,'0')}`,cutoff);
    const cell=saved[s.card]?.[ym];
    return {...s,manualYm:ym,manualAmount:cell==null?null:debtValueTotal(cell),difference:cell==null?null:s.amount-debtValueTotal(cell),supplement:cell?.installmentForecast};
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.card.localeCompare(b.card));
}

// A whole card/month statement replaces a schedule; never add it to a manual total.
// Purchase amounts and generic acceptance emails cannot supply installment amounts.
export function reconcileInstallments(saved={},feed,cards=[],cutoff=0,closed=[],today=localDay()) {
  const debt={...saved},reviews=[];
  const sources=Object.values(feed?.installmentSchedules||{});
  const groups=new Map();
  for(const source of sources){
    if(!source || !validDay(source.date))continue;
    const ym=nominalMonth(source,cards,cutoff),key=`${source.card}|${ym}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(source);
  }
  for(const [key,rows] of groups){
    const s=rows[0],card=cards.find(c=>c.name===s.card),ym=nominalMonth(s,cards,cutoff);
    const report=(status,reason)=>reviews.push({key,card:s.card,ym,date:s.date,status,reason,asOf:s.asOf,amount:s.amount});
    if(rows.length!==1){report('review','同じ月の資料が重複');continue;}
    if(!card||!s.id||!s.evidence||!validDay(s.asOf)||s.asOf>today||s.confirmed!==true||s.complete!==true||s.scope!=='card-month-installments'||!Array.isArray(s.items)||!Number.isSafeInteger(s.amount)||s.amount<0){report('review','カード・回数別の確定資料が不足');continue;}
    if(closed.includes(ym)||closed.includes(cycleYm(s.date,cutoff))||s.date<today){report('history','過去分は保持');continue;}
    const ids=new Set(),purchaseIds=[];
    const valid=s.items.every(item=>{
      if(!item.id||ids.has(item.id)||!item.label?.trim()||!Number.isSafeInteger(item.amount)||item.amount<0||!validDay(item.purchaseDate)||item.purchaseDate>s.date)return false;
      ids.add(item.id);
      if(item.installmentNumber!=null&&(!Number.isInteger(item.installmentNumber)||!Number.isInteger(item.totalInstallments)||item.installmentNumber<1||item.totalInstallments<item.installmentNumber))return false;
      if(cardPaymentDate(item.purchaseDate,card)===s.date){
        const transaction=feed?.bankSnapshot?.transactions?.[item.transactionId];
        if(!transaction||transaction.date!==item.purchaseDate||!item.transactionId.startsWith('mf-card:')||cardForPurchase(transaction.account,cards)?.name!==card.name)return false;
        purchaseIds.push(item.transactionId);
      }
      return true;
    });
    if(!valid||s.items.reduce((n,i)=>n+i.amount,0)!==s.amount){report('review','分割内訳・合計・元明細の確認が必要');continue;}
    let old=saved[s.card]?.[ym];
    // A phone may never have persisted the derived preview. Rebuild only an
    // identical, verified preview before promoting it, preserving manual items.
    if(old!=null&&!old.installmentSync&&debtValueTotal(old)!==s.amount){
      const sameItems=(items)=>JSON.stringify(items.map(i=>[i.id,i.label,i.purchaseDate,i.amount,i.installmentNumber,i.totalInstallments]).sort((a,b)=>a[0].localeCompare(b[0])));
      const previews=installmentPreviews(feed?.installmentCollection,cards,saved,cutoff,today)
        .filter(p=>p.card===s.card&&p.date===s.date&&p.asOf<=s.asOf&&p.amount===s.amount&&sameItems(p.items)===sameItems(s.items));
      if(previews.length===1){
        const prior=previews[0],candidate={...saved};
        supplementPreviews(candidate,{...feed,installmentSchedules:{},installmentCollection:{statements:{[prior.id]:prior}}},cards,cutoff,closed,today,[]);
        const rebuilt=candidate[s.card]?.[ym];
        if(rebuilt?.installmentForecast&&debtValueTotal(rebuilt)===s.amount)old=rebuilt;
      }
    }
    const oldTotal=debtValueTotal(old),base=old?.installmentSync;
    if(base?.asOf>s.asOf){report('history','新しい資料を保持');continue;}
    const unchanged=base&&!base.manualItemsPreserved&&JSON.stringify(old.items)===JSON.stringify(base.items);
    if(old!=null&&!unchanged&&oldTotal!==s.amount){report('conflict','手入力との差額あり・元の予定を保持');continue;}
    const fiscal=Number(ym.slice(0,4))-(Number(ym.slice(5))<4?1:0);
    if(old==null&&(saved[s.card]?.[`FY:${fiscal}`]!=null||saved[s.card]?.[String(fiscal)]!=null)){
      report('conflict','年度合計と重なる可能性・元の予定を保持');continue;
    }
    const items=s.items.map(i=>({...i,id:`installment:${s.id}:${i.id}`}));
    // Matched manual cells keep their IDs and notes. Only a source-owned cell updates automatically.
    const value=old!=null&&!unchanged?{...(typeof old==='object'?old:{items:[{id:`manual:${key}`,label:'手入力',amount:oldTotal}]})}:{items};
    delete value.installmentForecast;
    value.installmentSync={id:s.id,date:s.date,asOf:s.asOf,evidence:s.evidence,purchaseIds,...(old!=null&&!unchanged?{manualItemsPreserved:true}:{}),items:value.items.map(i=>({...i})),sourceItems:items.map(i=>({...i}))};
    debt[s.card]={...debt[s.card],[ym]:value};
    report(old!=null&&!unchanged?'matched':'synced',old!=null&&!unchanged?'手入力と一致':'確定予定を自動反映');
  }
  supplementPreviews(debt,feed,cards,cutoff,closed,today,reviews);
  // Issuer aggregate tables verify existing cells only. They cannot identify first
  // purchases, so never use them to add payments or replace a manual annual total.
  for(const s of Object.values(feed?.installmentCollection?.summaries||{})){
    const card=cards.find(c=>c.name===s.card);
    if(!card?.paymentDay||s.kind!=='issuer-monthly-summary'||s.complete!==true||!s.evidence||!validDay(s.asOf)||s.asOf>today)continue;
    for(const row of s.months||[]){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.paymentMonth)||!Number.isSafeInteger(row.amount)||row.amount<0)continue;
      const [year,month]=row.paymentMonth.split('-').map(Number);
      const date=nextBankBusinessDay(`${row.paymentMonth}-${String(Math.min(card.paymentDay,new Date(year,month,0).getDate())).padStart(2,'0')}`);
      const ym=cycleYm(date,cutoff),key=`${s.card}|${ym}`;
      if(date<today||closed.includes(ym)||reviews.some(r=>r.key===key))continue;
      const old=debt[s.card]?.[ym];
      if(old==null)continue;
      const matched=debtValueTotal(old)===row.amount;
      reviews.push({key,card:s.card,ym,date,asOf:s.asOf,amount:row.amount,status:matched?'matched':'conflict',reason:matched?'カード会社の予定表と一致':'カード会社の予定額と差額あり・手入力を保持'});
    }
  }
  return {debt,reviews};
}

const itemSignature=items=>JSON.stringify((items||[]).map(i=>[i.id,i.label||'',Number(i.amount)]));
const amounts=items=>items.map(i=>Number(i.amount)).sort((a,b)=>a-b).join(',');
// Only complete issuer statements can fill omissions. Matching a whole skip-payment
// group by its multiset also handles separate equal-price charges without collapsing them.
function supplementPreviews(debt,feed,cards,cutoff,closed,today,reviews){
  const previews=installmentPreviews(feed?.installmentCollection,cards,debt,cutoff,today);
  for(const s of previews){
    const ym=s.manualYm,key=`${s.card}|${ym}`,card=cards.find(c=>c.name===s.card);
    const report=(status,reason)=>reviews.push({key,card:s.card,ym,date:s.date,asOf:s.asOf,amount:s.amount,status,reason});
    if(s.date<today||closed.includes(ym)||closed.includes(cycleYm(s.date,cutoff)))continue;
    if(previews.filter(p=>p.card===s.card&&p.date===s.date).length!==1){report('review','同じ支払日の資料が重複');continue;}
    if(Object.values(feed?.installmentSchedules||{}).some(x=>x.card===s.card&&x.date===s.date))continue;
    const old=debt[s.card]?.[ym],base=old?.installmentForecast;
    if(old?.installmentSync||old?.installmentForecastOverride?.date===s.date)continue;
    if(base?.asOf>s.asOf)continue;
    if(base&&itemSignature(old.items)!==itemSignature(base.items)){
      debt[s.card]={...debt[s.card],[ym]:{...old,installmentForecast:undefined,installmentForecastOverride:{date:s.date,asOf:base.asOf}}};
      report('conflict','編集した予定を保持');continue;
    }
    const fiscal=Number(ym.slice(0,4))-(Number(ym.slice(5))<4?1:0);
    if(old==null&&(debt[s.card]?.[`FY:${fiscal}`]!=null||debt[s.card]?.[String(fiscal)]!=null)){report('conflict','年度合計との重複を確認');continue;}
    const manual=base?base.manualItems:old==null?[]:Array.isArray(old.items)?old.items: [{id:`manual:${key}`,label:'',amount:debtValueTotal(old)}];
    const total=manual.reduce((n,i)=>n+Number(i.amount),0);
    let missing=[];
    if(total===s.amount){missing=[];}
    else if(!manual.length){missing=s.items;}
    else {
      const skip=s.items.filter(i=>i.paymentType==='skip');
      if(manual.every(i=>!i.label?.trim())&&skip.length===manual.length&&amounts(skip)===amounts(manual))missing=s.items.filter(i=>i.paymentType!=='skip');
      else {
        const rest=[...s.items];let matched=true;
        for(const item of manual){
          const matches=rest.filter(i=>Number(item.amount)===i.amount&&(item.sourceId===i.id||item.label?.trim()===i.label.trim())&&(!item.purchaseDate||item.purchaseDate===i.purchaseDate));
          if(matches.length!==1){matched=false;break;}
          rest.splice(rest.indexOf(matches[0]),1);
        }
        if(!matched){report('conflict','手入力の内訳との対応を確認');continue;}missing=rest;
      }
    }
    if(total+missing.reduce((n,i)=>n+i.amount,0)!==s.amount){report('conflict','手入力との差額を確認');continue;}
    const purchaseIds=[];
    const safe=s.items.every(i=>{
      if(cardPaymentDate(i.purchaseDate,card)!==s.date)return true;
      const tx=feed?.bankSnapshot?.transactions?.[i.transactionId];
      if(!i.transactionId?.startsWith('mf-card:')||!tx||tx.date!==i.purchaseDate||cardForPurchase(tx.account,cards)?.name!==s.card)return false;
      purchaseIds.push(i.transactionId);return true;
    });
    if(!safe){report('review','初回利用との重複を確認');continue;}
    const added=missing.map(i=>({...i,sourceId:i.id,id:`preview:${s.id}:${i.id}`}));
    const items=[...manual.map(i=>({...i})),...added];
    debt[s.card]={...debt[s.card],[ym]:{...(typeof old==='object'?old:{}),items,installmentForecast:{
      id:s.id,date:s.date,asOf:s.asOf,evidence:s.evidence,confirmed:false,statementTotal:s.statementTotal,
      ordinaryAmount:s.ordinaryAmount,purchaseIds,manualItems:manual.map(i=>({...i})),items:items.map(i=>({...i})),
      addedCount:added.length,addedAmount:added.reduce((n,i)=>n+i.amount,0)
    }}};
    report(missing.length?'supplemented':'matched',missing.length?`${missing.length}件を支払見込みに補完`:'手入力と一致');
  }
}
