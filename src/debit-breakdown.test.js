import {expect,it} from 'vitest';
import {debitBreakdown} from './debit-breakdown';
import {upcomingDebits} from './utils';

const cards=[{id:'j',name:'JCB',cutoffDay:15,paymentDay:10}];
const base={id:'card|2026-11|JCB',label:'JCB',date:'2026-12-10',amount:13000,kind:'card',status:'forecast'};
const purchases=[
  {id:'p',date:'2026-11-01',account:'JCB',amount:-12000,description:'家電',spendingCategory:'物販'},
  {id:'r',date:'2026-11-03',account:'JCB',amount:2000,description:'返金',spendingCategory:'物販'},
  {id:'later',date:'2026-11-17',account:'JCB',amount:-5000,description:'翌回分'},
];
const debt={JCB:{'2026-11':{items:[{id:'d',label:'分割購入',amount:3000}]}}};

it('matches the forecast with signed refunds, due-date boundaries and no extra recurring plan',()=>{
  const context={cards,debt,purchases,cutoff:10,subs:[{id:'s',card:'JCB',name:'重複予定',amount:999,cycle:'monthly',startDate:'2026-11-01'}]};
  const before=JSON.stringify(context);
  const result=debitBreakdown(base,context);
  expect(result.lines.map(r=>r.id)).toEqual(['p','r']);
  expect(result.purchaseTotal).toBe(10000);
  expect(result.fixedTotal).toBe(0);
  expect(result.debtTotal).toBe(3000);
  expect(result.difference).toBe(0);
  expect(upcomingDebits([],cards,debt,context.subs,10,'2026-11','2026-11-22',30,[],purchases)[0].amount).toBe(result.detailTotal);
  expect(JSON.stringify(context)).toBe(before);
});
it('shows positive and negative reconciliation differences without changing an observed bill',()=>{
  expect(debitBreakdown({...base,amount:15000,fromFeed:true},{cards,debt,purchases,cutoff:10}).difference).toBe(2000);
  expect(debitBreakdown({...base,amount:9000,fromFeed:true},{cards,debt,purchases,cutoff:10}).difference).toBe(-4000);
});
it('uses recurring plan lines only when no charge candidates exist, respecting cancellation',()=>{
  const subs=[{id:'s',card:'JCB',name:'通信',amount:1000,cycle:'monthly',startDate:'2026-01-01'},
    {id:'c',card:'JCB',name:'解約済み',amount:500,cycle:'monthly',startDate:'2026-01-01',endDate:'2026-10-01'}];
  const d=debitBreakdown({...base,amount:1000},{cards,subs,cutoff:10});
  expect(d.fixedLines).toEqual([{id:'s',label:'通信',amount:1000}]);
  expect(d.difference).toBe(0);
});
it('attributes a shared SMCC source only to a unique reconciling bill and counts investment once',()=>{
  const cards=[{id:'g',name:'SMCC Gold',cutoffDay:31,paymentDay:26},{id:'s',name:'smcc',cutoffDay:31,paymentDay:26}];
  const bills=[{id:'g',label:'SMCC Gold',date:'2026-11-26',amount:64410,kind:'card',fromFeed:true},
    {id:'s',label:'smcc',date:'2026-11-26',amount:294,kind:'card',status:'forecast'}];
  const investments=[{id:'mf-invest:i',account:'三井住友カード',kind:'card',broker:'SBI証券',date:'2026-10-14',amount:-20000}];
  const purchases=[{id:'p',account:'三井住友カード',date:'2026-10-01',amount:-9544,description:'利用'}];
  const debt={'SMCC Gold':{'2026-11':34866},smcc:{'2026-11':294}};
  const context={cards,bills,purchases,investments,debt,cutoff:10};
  const d=debitBreakdown(bills[0],context);
  expect(d.familyMatched).toBe(true);expect(d.difference).toBe(0);
  expect(d.groups).toContainEqual({label:'カード積立',amount:20000});
  expect(debitBreakdown(bills[1],context).lines).toHaveLength(0);
  const duplicate={...investments[0],id:'mf-card:i',description:'SBI積立',spendingCategory:'投資'};
  expect(debitBreakdown(bills[0],{...context,purchases:[...purchases,duplicate]}).purchaseTotal).toBe(29544);
  const ambiguous=[bills[0],{...bills[1],amount:29838,fromFeed:true}];
  expect(debitBreakdown(bills[0],{...context,bills:ambiguous}).familyMatched).toBe(false);
});
it('keeps card-family purchases together for SAISON but does not turn an MF partial card into a full-family bill',()=>{
  const cards=[{id:'s',name:'SAISON',cutoffDay:10,paymentDay:4}];
  const purchases=['likeme','MUJI CARD','SAISON Digital'].map((account,i)=>({id:String(i),date:'2026-11-01',account,amount:-1000,description:account}));
  const row={...base,label:'SAISON',date:'2026-12-04',amount:3000};
  expect(debitBreakdown(row,{cards,purchases,cutoff:10}).lines).toHaveLength(3);
  expect(debitBreakdown(row,{cards,purchases,cutoff:10}).difference).toBe(0);
});
