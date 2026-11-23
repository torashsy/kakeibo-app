import {it,expect} from 'vitest';
import {reconcileInstallments} from './installment-sync';
import {upcomingDebits,cycleYm} from './utils';
import {debitBreakdown} from './debit-breakdown';
const today='2026-11-23',cards=[{id:'view',name:'VIEW',cutoffDay:5,paymentDay:4}];
const source={id:'statement',card:'VIEW',date:'2026-12-04',asOf:today,amount:1200,evidence:'test-statement',scope:'card-month-installments',confirmed:true,complete:true,
  items:[{id:'contract',label:'商品A',amount:1200,purchaseDate:'2026-08-01',installmentNumber:4,totalInstallments:12}]};
const feed=s=>({installmentSchedules:{[s.id]:s}});
const merge=(saved,s=source)=>reconcileInstallments(saved,feed(s),cards,10,[],today);
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
