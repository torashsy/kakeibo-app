// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Deadlines} from './deadlines';
import {rakutenExpiry} from '../deadlines';
import {reconcilePoints} from '../point-sync';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
const lot=(id,amount,expiresOn)=>({id,name:'楽天ポイント(期間限定ポイント)',amount,unit:'pt',expiresOn,expiryMode:expiresOn?'date':'unknown'});
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,10,23,12));
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});

it('shows expiry lots once, ordered, with unknown amounts separate from this month',async()=>{
  const points=[lot('unknown',900),lot('later',400,'2027-02-28'),lot('month',250,'2026-11-30'),{id:'interest',name:'楽天ポイント利息',amount:60}];
  const before=JSON.stringify(points);
  await act(async()=>root.render(<Deadlines mode="points" points={points}/>));
  const panel=host.querySelector('.rakuten-expiry');
  expect([...panel.querySelectorAll('.point-expiry-overview strong')].map(n=>n.textContent)).toEqual(['250 pt','900 pt']);
  expect([...panel.querySelectorAll('.rakuten-lots button')].map(n=>n.getAttribute('aria-label'))).toEqual([
    '楽天ポイント 2026/11/30まで 250ポイントを編集','楽天ポイント 2027/2/28まで 400ポイントを編集','楽天ポイント 期限未確認 900ポイントを編集']);
  expect(host.querySelectorAll('.point-balances li')).toHaveLength(4);
  expect(JSON.stringify(points)).toBe(before);
});

it('handles month boundaries, expired, used, hidden and zero lots without inventing balances',()=>{
  const points=[lot('old',100,'2026-11-22'),lot('today',200,'2026-11-23'),lot('next',300,'2026-12-01'),{...lot('used',400,'2026-11-30'),status:'used'},{...lot('hidden',500),hidden:true},lot('zero',0)];
  expect(rakutenExpiry(points,'2026-11-23').thisMonth).toBe(200);
  expect(rakutenExpiry(points,'2026-12-01').thisMonth).toBe(300);
  expect(rakutenExpiry(points,'2026-12-01').lots).toHaveLength(3);
});

it('opens the existing editor and lets a user mark a lot used without touching other points',async()=>{
  const points=[lot('a',250,'2026-11-30'),lot('b',900)];const save=vi.fn();
  await act(async()=>root.render(<Deadlines mode="points" points={points} onSavePoints={save}/>));
  await act(async()=>host.querySelector('.rakuten-lots button').click());
  expect(document.querySelector('.deadline-editor input[type=date]').value).toBe('2026-11-30');
  const used=[...document.querySelectorAll('.deadline-editor button')].find(b=>b.textContent==='利用済みにする');
  await act(async()=>used.click());
  expect(save.mock.calls[0][0][0].status).toBe('used');
  expect(save.mock.calls[0][0][1]).toEqual(points[1]);
  await act(async()=>root.render(<Deadlines mode="points" points={save.mock.calls[0][0]} onSavePoints={save}/>));
  expect(host.querySelector('.point-expiry-overview strong').textContent).toBe('0 pt');
});

it('updates this-month totals from new snapshots while preserving a manually supplied expiry',async()=>{
  const source={...lot('sync',800),asOf:'2026-11-22',evidence:'test',unit:'pt'};
  const old=reconcilePoints([],{pointBalances:{sync:source}},'2026-11-23');
  old[0]={...old[0],expiresOn:'2026-11-30',expiryMode:'date'};
  const next=reconcilePoints(old,{pointBalances:{sync:{...source,amount:600,asOf:'2026-11-23'}}},'2026-11-23');
  await act(async()=>root.render(<Deadlines mode="points" points={next}/>));
  expect(host.querySelector('.point-expiry-overview strong').textContent).toBe('600 pt');
  expect(next[0].expiresOn).toBe('2026-11-30');
  expect(old[0].amount).toBe(800);
});
