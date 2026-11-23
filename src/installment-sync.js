import {cycleYm,cardPaymentDate,cardForPurchase,debtValueTotal} from './utils';
import {localDay,validDay} from './deadlines';

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
  return {debt,reviews};
}
