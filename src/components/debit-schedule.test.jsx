// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {DebitSchedule} from './debit-schedule';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
it('opens each bill in place, shows signed refunds and keeps month switching and totals intact',async()=>{
  const host=document.createElement('div'),root=createRoot(host);
  const row={id:'j',date:'2026-12-10',label:'JCB',amount:6000,kind:'card',fromFeed:true};
  const purchases=[
    {id:'a',date:'2026-11-01',account:'JCB',description:'大きな買い物',amount:-5000,spendingCategory:'物販'},
    {id:'b',date:'2026-11-02',account:'JCB',description:'通信',amount:-2000,spendingCategory:'携帯代'},
    {id:'c',date:'2026-11-03',account:'JCB',description:'返品',amount:1000,spendingCategory:'物販'},
  ];
  const url=location.href;
  try {
    await act(()=>root.render(<DebitSchedule rows={[row]} following={[{...row,id:'next',date:'2027-01-12',amount:3000}]} end="2026-12-10" cards={[{id:'j',name:'JCB',cutoffDay:15,paymentDay:10}]} purchases={purchases} cutoff={10}/>));
    const disclosure=host.querySelector('.debit-disclosure');
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector('summary').textContent).toContain('大きな買い物');
    await act(()=>disclosure.querySelector('summary').click());
    expect(disclosure.open).toBe(true);
    expect(host.querySelectorAll('.debit-purchases li')).toHaveLength(3);
    expect(host.querySelector('.debit-detail').textContent).toContain('返金 −¥1,000');
    expect(host.querySelector('.debit-detail').textContent).not.toContain('内訳未照合');
    expect(location.href).toBe(url);
    await act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='次月分').click());
    expect(host.querySelector('.debit-disclosure').open).toBe(false);
    expect(host.querySelector('.debit-schedule>header').textContent).toContain('¥3,000');
    expect(host.querySelectorAll('.debit-purchases li')).toHaveLength(0);
    expect(host.textContent).toContain('内訳未照合');
    expect(location.href).toBe(url);
  }finally{await act(()=>root.unmount());}
});
