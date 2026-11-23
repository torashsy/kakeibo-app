import {it,expect} from 'vitest';
import {reconcileInstallments,installmentPreviews} from './installment-sync';
import {upcomingDebits,cycleYm,debtValueTotal,plannedDebt} from './utils';
import {debitBreakdown} from './debit-breakdown';
const today='2026-11-23',cards=[{id:'view',name:'VIEW',cutoffDay:5,paymentDay:4}];
const source={id:'statement',card:'VIEW',date:'2026-12-04',asOf:today,amount:1200,evidence:'test-statement',scope:'card-month-installments',confirmed:true,complete:true,
  items:[{id:'contract',label:'商品A',amount:1200,purchaseDate:'2026-08-01',installmentNumber:4,totalInstallments:12}]};
const feed=s=>({installmentSchedules:{[s.id]:s}});
const merge=(saved,s=source)=>reconcileInstallments(saved,feed(s),cards,10,[],today);
it('displays provisional itemized statements without changing debt and compares holiday payments to the nominal month',()=>{
  const c=[{name:'Example',paymentDay:10}],saved={Example:{'2026-12':900,'2027-01':777}};
  const s={...source,id:'preview',card:'Example',date:'2027-01-12',kind:'issuer-itemized-preview',confirmed:false,statementTotal:1700,ordinaryAmount:500,items:[{...source.items[0],paymentType:'installment'}]};
  const f={installmentCollection:{statements:{preview:s}}};
  const result=installmentPreviews(f.installmentCollection,c,saved,10,today);
  expect(result).toHaveLength(1);expect(result[0].manualYm).toBe('2026-12');expect(result[0].difference).toBe(300);
  expect(reconcileInstallments(saved,f,c,10,[],today).debt).toEqual(saved);
  expect(installmentPreviews({statements:{preview:{...s,amount:1500}}},c,saved,10,today)).toEqual([]);
  expect(installmentPreviews({statements:{preview:{...s,confirmed:true}}},c,saved,10,today)).toEqual([]);
  expect(installmentPreviews({statements:{preview:{...s,items:[...s.items,...s.items]}}},c,saved,10,today)).toEqual([]);
});
it('verifies issuer monthly totals without changing manual payments or adding annual-overlap payments',()=>{
  const saved={VIEW:{'2026-11':1200,'FY:2026':10000}};
  const summary={id:'issuer',kind:'issuer-monthly-summary',card:'VIEW',complete:true,evidence:'issuer-table',asOf:today,months:[{paymentMonth:'2026-12',amount:1200,remaining:10000},{paymentMonth:'2027-01',amount:1200,remaining:8800}]};
  const f={installmentCollection:{summaries:{issuer:summary}}};
  const result=reconcileInstallments(saved,f,cards,10,[],today);
  expect(result.debt).toEqual(saved);expect(result.reviews).toHaveLength(1);expect(result.reviews[0].status).toBe('matched');
  summary.months[0].amount=1300;
  expect(reconcileInstallments(saved,f,cards,10,[],today).reviews[0].status).toBe('conflict');
  expect(reconcileInstallments(saved,f,cards,10,['2026-11'],today).reviews).toEqual([]);
  expect(saved.VIEW['2026-11']).toBe(1200);
});
it('imports complete future schedules without adding them to matching manual amounts',()=>{
  const initial=merge({});expect(initial.debt.VIEW['2026-11'].items[0].amount).toBe(1200);
  expect(merge(initial.debt).debt).toEqual(initial.debt);
  const saved={VIEW:{'2026-11':{items:[{id:'manual',label:'メモ',amount:1200}]}}};
  const result=merge(saved);expect(result.debt.VIEW['2026-11'].items).toEqual(saved.VIEW['2026-11'].items);
  expect(result.reviews[0].status).toBe('matched');expect(saved.VIEW['2026-11'].installmentSync).toBeUndefined();
});
it('holds manual conflicts, fiscal overlaps, ambiguous sources and incomplete acceptance notices',()=>{
  const saved={VIEW:{'2026-11':1000}};
  expect(merge(saved).debt).toEqual(saved);expect(merge(saved).reviews[0].status).toBe('conflict');
  expect(merge({VIEW:{'FY:2026':12000}}).reviews[0].status).toBe('conflict');
  expect(merge({}, {...source,complete:false}).debt).toEqual({});
  expect(reconcileInstallments({}, {installmentSchedules:{a:source,b:{...source,id:'other'}}},cards,10,[],today).debt).toEqual({});
  expect(reconcileInstallments({},feed(source),cards,10,['2026-11'],today).debt).toEqual({});
});
it('updates source-owned schedules but preserves subsequent manual edits and newer versions',()=>{
  const initial=merge({}).debt;
  const update={...source,asOf:'2026-11-22',amount:900,items:[{...source.items[0],amount:900}]};
  expect(merge(initial,update).debt).toEqual(initial);
  const latest={...update,asOf:today};expect(merge(initial,latest).debt.VIEW['2026-11'].items[0].amount).toBe(900);
  const edited=structuredClone(initial);edited.VIEW['2026-11'].items[0].amount=700;
  expect(merge(edited,latest).debt).toEqual(edited);
});
it('requires first-payment source identity and removes the original charge from debit estimates only',()=>{
  const transaction={id:'mf-card:a',account:'VIEW CARD',date:'2026-10-20',amount:-12000,description:'商品A'};
  const s={...source,items:[{...source.items[0],purchaseDate:transaction.date,transactionId:transaction.id,installmentNumber:1}]};
  expect(merge({},s).debt).toEqual({});
  const f={...feed(s),bankSnapshot:{transactions:{[transaction.id]:transaction}}};
  const {debt}=reconcileInstallments({},f,cards,10,[],today);
  expect(debt.VIEW['2026-11'].installmentSync.purchaseIds).toEqual([transaction.id]);
  const purchases=[transaction,{id:'mf-card:b',account:'VIEW CARD',date:'2026-10-25',amount:-500,description:'買物'}];
  const bills=upcomingDebits([],cards,debt,[],10,'2026-11',today,30,[],purchases);
  expect(bills[0].amount).toBe(1700);
  const detail=debitBreakdown(bills[0],{cards,debt,purchases,cutoff:10});
  expect(detail.purchaseTotal).toBe(500);expect(detail.debtTotal).toBe(1200);
  expect(purchases[0].amount).toBe(-12000);
});

const previewCards=[{id:'example',name:'Example',cutoffDay:15,paymentDay:10}];
const pending={...source,id:'pending',card:'Example',date:'2027-01-12',kind:'issuer-itemized-preview',confirmed:false,
 amount:2200,ordinaryAmount:500,statementTotal:2700,items:[
  {id:'a',label:'店A',amount:900,purchaseDate:'2026-07-01',paymentType:'skip',installmentNumber:1,totalInstallments:1},
  {id:'b',label:'店A',amount:900,purchaseDate:'2026-07-01',paymentType:'skip',installmentNumber:1,totalInstallments:1},
  {id:'c',label:'店B',amount:400,purchaseDate:'2026-03-01',paymentType:'installment',installmentNumber:10,totalInstallments:12}]};
const manual={Example:{'2026-12':{items:[{id:'m1',label:'',amount:900},{id:'m2',label:'',amount:900}]}}};
const previewFeed=s=>({installmentCollection:{statements:{[s.id]:s}}});
const supplement=(saved=manual,s=pending)=>reconcileInstallments(saved,previewFeed(s),previewCards,10,[],today);
it('supplements only missing items, preserves duplicate manual charges and is idempotent',()=>{
 const before=JSON.stringify(manual),r=supplement(),cell=r.debt.Example['2026-12'];
 expect(cell.items.slice(0,2)).toEqual(manual.Example['2026-12'].items);
 expect(cell.items).toHaveLength(3);expect(cell.installmentForecast.addedAmount).toBe(400);
 expect(supplement(r.debt).debt).toEqual(r.debt);expect(JSON.stringify(manual)).toBe(before);
 expect(r.reviews[0].status).toBe('supplemented');
});
it('places a holiday-shifted bill once in its actual cycle with the correct breakdown and plan',()=>{
 const {debt}=supplement();
 expect(upcomingDebits([],previewCards,debt,[],10,'2027-01','2027-01-13')).toEqual([]);
 const rows=upcomingDebits([],previewCards,debt,[],10,'2026-12','2026-12-11');
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({date:'2027-01-12',amount:2700,status:'forecast'});
 expect(debitBreakdown(rows[0],{cards:previewCards,debt,cutoff:10}).debtTotal).toBe(2200);
 expect(plannedDebt(debt,'2026-12',10)).toBe(2200);expect(plannedDebt(debt,'2027-01',10)).toBe(0);
 const observed=[{card:'Example',date:'2027-01-12',amount:2800}];
 const fromFeed=upcomingDebits([],previewCards,debt,[],10,'2026-12','2026-12-11',30,observed);
 expect(fromFeed).toHaveLength(1);expect(fromFeed[0].amount).toBe(2800);
});
it('refreshes automatic items, preserves subsequent manual changes and rejects ambiguous partial totals',()=>{
 const initial=supplement().debt;
 const next={...pending,amount:2300,statementTotal:2800,items:pending.items.map(i=>i.id==='c'?{...i,amount:500}:i)};
 expect(debtValueTotal(supplement(initial,next).debt.Example['2026-12'])).toBe(2300);
 const edited=structuredClone(initial);edited.Example['2026-12'].items[2].amount=100;
 const held=supplement(edited,next);expect(debtValueTotal(held.debt.Example['2026-12'])).toBe(1900);
 expect(held.debt.Example['2026-12'].installmentForecast).toBeUndefined();
 expect(supplement(held.debt,next).debt).toEqual(held.debt);
 const ambiguous={Example:{'2026-12':{items:[{id:'x',label:'',amount:900}]}}};
 expect(supplement(ambiguous).debt).toEqual(ambiguous);
});
it('holds closed months, annual overlaps and duplicate statements and never promotes pending to actuals',()=>{
 expect(reconcileInstallments(manual,previewFeed(pending),previewCards,10,['2026-12'],today).debt).toEqual(manual);
 const annual={Example:{'FY:2026':10000}};expect(supplement(annual).debt).toEqual(annual);
 const duplicates={installmentCollection:{statements:{a:pending,b:{...pending,id:'other'}}}};
 expect(reconcileInstallments(manual,duplicates,previewCards,10,[],today).debt).toEqual(manual);
 expect(pending.confirmed).toBe(false);
});
it('transitions a pending forecast to a confirmed schedule without retaining two cells or bills',()=>{
 const initial=supplement().debt;
 const confirmed={...pending,kind:undefined,confirmed:true,scope:'card-month-installments'};
 const f={...previewFeed(pending),...feed(confirmed)};
 const r=reconcileInstallments(initial,f,previewCards,10,[],today);
 expect(Object.keys(r.debt.Example)).toEqual(['2026-12']);
 expect(r.debt.Example['2026-12'].installmentForecast).toBeUndefined();
 const bills=upcomingDebits([],previewCards,r.debt,[],10,'2026-12','2026-12-11');
 expect(bills).toHaveLength(1);expect(bills[0].amount).toBe(2200);
});
