import {expect,it} from 'vitest';
import {deadlineEvents,normalizePoints,daysBetween,validDay} from './deadlines';

it('keeps inferred renewals distinct and suppresses hidden or unconfirmed renewals',()=>{
  const base={name:'Service',amount:1000,cycle:'monthly',renewal:'2026-11-29',autoRenew:false};
  const subs=[{...base,id:'inferred',subscriptionSync:{includeInForecast:true,renewalEstimated:true}},
    {...base,id:'unknown',subscriptionSync:{includeInForecast:false}},
    {...base,id:'hidden',hidden:true},
    {...base,id:'canceled',subscriptionSync:{includeInForecast:false},endDate:'2026-12-01'}];
  expect(deadlineEvents(subs,[],'2026-11-20').map(e=>[e.sourceId,e.kind])).toEqual([['inferred','次回目安'],['canceled','契約終了']]);
});

it('keeps separate expiry lots and never treats an unknown expiry as unlimited',()=>{
  const points=normalizePoints([{id:'a',name:'Vポイント',amount:300,expiresOn:'2026-11-30'},{id:'b',name:'Vポイント',amount:100,expiryMode:'unknown'},{id:'c',name:'Ponta',amount:80,expiryMode:'none'},{id:'d',name:'invalid',amount:-1}]);
  expect(points).toHaveLength(3);
  expect(points.map(p=>p.expiryMode)).toEqual(['date','unknown','none']);
  expect(deadlineEvents([],points,'2026-11-19').map(e=>[e.sourceId,e.amount,e.days])).toEqual([['a',300,11]]);
});
it('retains expired balances but excludes used and zero balances from reminders',()=>{
  const points=[{id:'a',name:'A',amount:200,expiresOn:'2026-11-18'},{id:'b',name:'B',amount:100,status:'used',expiresOn:'2026-11-20'},{id:'c',name:'C',amount:0,expiresOn:'2026-11-20'}];
  expect(deadlineEvents([],points,'2026-11-19')).toMatchObject([{sourceId:'a',days:-1,amount:200}]);
  expect(normalizePoints(points)[0].amount).toBe(200);
});
it('orders renewal, trial and cancellation dates without altering subscription data',()=>{
  const subs=[{id:'a',name:'A',amount:1000,cycle:'monthly',renewal:'2026-10-31',trialEndDate:'2026-11-22',cancelBy:'2026-11-21'},
    {id:'b',name:'ended',amount:500,cycle:'monthly',renewal:'2026-10-20',endDate:'2026-10-31'},
    {id:'c',name:'ending',amount:500,cycle:'monthly',renewal:'2026-11-25',endDate:'2026-11-23'}];
  const before=JSON.stringify(subs);
  expect(deadlineEvents(subs,[],'2026-11-19').map(e=>[e.kind,e.date])).toEqual([['解約期限','2026-11-21'],['無料期間終了','2026-11-22'],['契約終了','2026-11-23'],['自動更新','2026-11-30']]);
  expect(JSON.stringify(subs)).toBe(before);
});
it('validates real dates and preserves the expiry day until the following day',()=>{
  expect(validDay('2026-02-30')).toBe(false);
  expect(validDay('2028-02-29')).toBe(true);
  expect(daysBetween('2026-11-19','2026-11-19')).toBe(0);
  expect(daysBetween('2026-11-19','2026-11-20')).toBe(-1);
});
