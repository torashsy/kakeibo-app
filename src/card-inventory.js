// Account labels are evidence of usage, not proof of distinct active contracts.
// This inventory never creates cards, bills or annual-fee transactions.
export function cardInventory(cards=[],transactions={}){
  const names=new Map();
  const feeCharges=[];
  for(const [id,tx] of Object.entries(transactions||{})){
    if(!(tx?.id||id).startsWith('mf-card:')||!tx.account)continue;
    const previous=names.get(tx.account);
    if(!previous||tx.date>previous.lastUsed)names.set(tx.account,{name:tx.account,lastUsed:tx.date});
    if(/^カード年会費$/.test(tx.description?.trim()||'')&&tx.amount<0)feeCharges.push({id:tx.id||id,date:tx.date,name:tx.account,amount:-tx.amount});
  }
  return {
    registered:cards.length,
    annualFees:cards.reduce((n,c)=>n+Math.max(0,Number(c.annualFee)||0),0),
    feeMonthsMissing:cards.filter(c=>Number(c.annualFee)>0&&!c.annualFeeMonth).length,
    sources:[...names.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja')),
    feeCharges:feeCharges.sort((a,b)=>b.date.localeCompare(a.date)),
  };
}
