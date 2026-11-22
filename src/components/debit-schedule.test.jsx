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
    expect(host.querySelector('.debit-detail').textContent).not.toContain('内訳確認中');
    expect(location.href).toBe(url);
    await act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='次月分').click());
    expect(host.querySelector('.debit-disclosure').open).toBe(false);
    expect(host.querySelector('.debit-schedule>header').textContent).toContain('¥3,000');
    expect(host.querySelectorAll('.debit-purchases li')).toHaveLength(0);
    expect(host.textContent).toContain('内訳確認中');
    expect(location.href).toBe(url);
  }finally{await act(()=>root.unmount());}
});

it('keeps the amount gap visible while separating optional evidence from the spending breakdown',async()=>{
  const host=document.createElement('div'),root=createRoot(host);
  const row={id:'v',date:'2026-12-04',label:'VIEW',amount:9000,kind:'card',fromFeed:true};
  const purchases=[{id:'p',date:'2026-10-23',account:'VIEW CARD',description:'交通チャージ',amount:-6000,spendingCategory:'交通費'}];
  const reviews={'VIEW|2026-12-04':{status:'unresolved',billAmount:9000,difference:3000,
    candidates:[{id:'p',date:'2026-10-23',amount:6000}],note:'前回にも同じ差額があります。',evidenceSummary:'支払方法変更の受付記録。対象利用は不明。'}};
  try {
    await act(()=>root.render(<DebitSchedule rows={[row]} end="2026-12-10" cards={[{id:'v',name:'VIEW',cutoffDay:5,paymentDay:4}]} purchases={purchases} reviews={reviews} cutoff={10}/>));
    const card=host.querySelector('.debit-disclosure');
    await act(()=>card.querySelector('summary').click());
    expect(host.querySelector('.debit-composition').textContent).toContain('¥6,000');
    expect(host.querySelector('.debit-gap-amount').textContent).toBe('内訳確認中¥3,000');
    expect(host.querySelector('.debit-detail').textContent).not.toContain('¥9,000');
    expect(host.querySelector('.debit-detail-title').textContent).toContain('推定');
    const evidence=host.querySelector('.debit-evidence');
    expect(evidence.open).toBe(false);
    const url=location.href;
    await act(()=>evidence.querySelector('summary').click());
    expect(evidence.open).toBe(true);
    expect(card.open).toBe(true);
    expect(evidence.textContent).toContain(reviews['VIEW|2026-12-04'].evidenceSummary);
    expect(location.href).toBe(url);
    expect(host.querySelectorAll('.debit-purchases li')).toHaveLength(1);
  }finally{await act(()=>root.unmount());}
});
