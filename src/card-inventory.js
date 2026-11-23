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

// Contract evidence is separate from accounting groups: never create bills or
// count an aggregate/old alias as another physical card. Closed records stay closed.
export function auditedCardInventory(audit,transactions={}){
  const records=new Map();
  for(const card of Array.isArray(audit?.cards)?audit.cards:[]){
    if(!card?.id||!card.name)continue;
    const existing=records.get(card.id);
    if(!existing||String(card.evidenceDate||'')>String(existing.evidenceDate||''))records.set(card.id,{...card});
  }
  const closedStatuses=['closed','ended','replaced'];
  for(const card of records.values()){
    if(closedStatuses.includes(card.status))continue;
    for(const [id,tx] of Object.entries(transactions||{})){
      if(!String(tx?.id||id).startsWith('mf-card:')||!card.sourceNames?.includes(tx.account)||!tx.date)continue;
      if(!card.lastActivity||tx.date>card.lastActivity)card.lastActivity=tx.date;
    }
    if(card.lastActivity)card.status='activity';
  }
  const all=[...records.values()];
  return {records:all,used:all.filter(c=>c.status==='activity'),pending:all.filter(c=>c.status!=='activity'&&!closedStatuses.includes(c.status)),closed:all.filter(c=>closedStatuses.includes(c.status))};
}
