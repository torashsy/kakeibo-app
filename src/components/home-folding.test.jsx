// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {SpendingPurpose} from './summary';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
it('keeps all purpose totals and comparison bars visible while folding merchant rows in place',async()=>{
 const purchases=[{id:'a',date:'2026-11-20',account:'Card',description:'Lunch',amount:-1500,spendingCategory:'外食'},
   {id:'b',date:'2026-11-21',account:'Card',description:'Clothes',amount:-4000,spendingCategory:'物販'}];
 const before=JSON.stringify(purchases),host=document.createElement('div'),root=createRoot(host);
 try {
  await act(()=>root.render(<SpendingPurpose compact purchases={purchases} ym="2026-11" cutoff={10}/>));
  const groups=[...host.querySelectorAll('details.purchase-group')];
  expect(groups).toHaveLength(2);
  expect(groups.every(g=>!g.open)).toBe(true);
  expect(host.querySelector('header strong').textContent).toBe('¥5,500');
  expect(groups.map(g=>g.querySelector('summary b').textContent)).toEqual(['¥4,000','¥1,500']);
  expect(groups.every(g=>g.querySelector('summary .purchase-track'))).toBe(true);
  const url=location.href;
  await act(()=>groups[0].querySelector('summary').click());
  expect(groups[0].open).toBe(true);
  expect(groups[0].textContent).toContain('Clothes');
  expect(location.href).toBe(url);expect(JSON.stringify(purchases)).toBe(before);
 }finally{await act(()=>root.unmount());}
});
