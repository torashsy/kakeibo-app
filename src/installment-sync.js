import {cycleYm,cardPaymentDate,cardForPurchase,debtValueTotal,nextBankBusinessDay} from './utils';
import {localDay,validDay} from './deadlines';

// Provisional issuer statements are evidence for display, never confirmed debt.
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
    return {...s,manualYm:ym,manualAmount:cell==null?null:debtValueTotal(cell),difference:cell==null?null:s.amount-debtValueTotal(cell)};
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
    const ym=cycleYm(source.date,cutoff),key=`${source.card}|${ym}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(source);
  }
  for(const [key,rows] of groups){
    const s=rows[0],card=cards.find(c=>c.name===s.card),ym=cycleYm(s.date,cutoff);
    const report=(status,reason)=>reviews.push({key,card:s.card,ym,date:s.date,status,reason,asOf:s.asOf,amount:s.amount});
    if(rows.length!==1){report('review','同じ月の資料が重複');continue;}
    if(!card||!s.id||!s.evidence||!validDay(s.asOf)||s.asOf>today||s.confirmed!==true||s.complete!==true||s.scope!=='card-month-installments'||!Array.isArray(s.items)||!Number.isSafeInteger(s.amount)||s.amount<0){report('review','カード・回数別の確定資料が不足');continue;}
    if(closed.includes(ym)||s.date<today){report('history','過去分は保持');continue;}
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
    const old=saved[s.card]?.[ym],oldTotal=debtValueTotal(old),base=old?.installmentSync;
    if(base?.asOf>s.asOf){report('history','新しい資料を保持');continue;}
    const unchanged=base&&JSON.stringify(old.items)===JSON.stringify(base.items);
    if(old!=null&&!unchanged&&oldTotal!==s.amount){report('conflict','手入力との差額あり・元の予定を保持');continue;}
    const fiscal=Number(ym.slice(0,4))-(Number(ym.slice(5))<4?1:0);
    if(old==null&&(saved[s.card]?.[`FY:${fiscal}`]!=null||saved[s.card]?.[String(fiscal)]!=null)){
      report('conflict','年度合計と重なる可能性・元の予定を保持');continue;
    }
    const items=s.items.map(i=>({...i,id:`installment:${s.id}:${i.id}`}));
    // Matched manual cells keep their IDs and notes. Only a source-owned cell updates automatically.
    const value=old!=null&&!unchanged?{...(typeof old==='object'?old:{items:[{id:`manual:${key}`,label:'手入力',amount:oldTotal}]})}:{items};
    value.installmentSync={id:s.id,asOf:s.asOf,evidence:s.evidence,purchaseIds,items:value.items.map(i=>({...i})),sourceItems:items.map(i=>({...i}))};
    debt[s.card]={...debt[s.card],[ym]:value};
    report(old!=null&&!unchanged?'matched':'synced',old!=null&&!unchanged?'手入力と一致':'確定予定を自動反映');
  }
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
