// @vitest-environment happy-dom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {DetailCards} from './detail';
import {PayrollReport} from './payroll-report';
import {buildStructure} from '../utils';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
it('月別記録は少数の内訳を最初から表示し、選んだ明細を編集できる',async()=>{
  const host=document.createElement('div'),root=createRoot(host),edit=vi.fn();
  const entries=[
    {id:'s',cat:'salary',item:'手取り',amount:250000,note:'給与'},
    {id:'a',cat:'card',item:'JCB',amount:1000,note:'食料品'},
    {id:'b',cat:'card',item:'JCB',amount:2000,note:'電車'},
    {id:'c',cat:'account',item:'残高',account:'口座A',amount:40000},
  ];
  const config={accounts:['口座A'],salaryItems:['手取り']},cards=[{id:'j',name:'JCB'}];
  try {
    await act(()=>root.render(<DetailCards S={buildStructure(entries,config,cards)} config={config} cards={cards} onEdit={edit}/>));
    expect([...host.querySelectorAll('h3')].map(n=>n.textContent)).toEqual(expect.arrayContaining(['給与1','カード1','口座残高1']));
    expect(host.textContent).toContain('食料品');expect(host.textContent).toContain('電車');
    const group=host.querySelector('[aria-expanded]');
    expect(group.getAttribute('aria-expanded')).toBe('true');
    await act(()=>group.click());expect(host.textContent).not.toContain('食料品');
    await act(()=>group.click());
    await act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('電車')).click());
    expect(edit).toHaveBeenCalledWith(entries[2]);
  }finally{await act(()=>root.unmount());}
});

it('給与の支給日一覧は常時表示し、日付から明細をその場で開く',async()=>{
  const host=document.createElement('div'),root=createRoot(host);
  const slips={a:{date:'2026-10-24',kind:'給与',gross:300000,net:240000,deductions:60000,earnings:{基本給:300000},withholdings:{社会保険:60000},overtimeHours:8}};
  try {
    await act(()=>root.render(<PayrollReport slips={slips} ym="2026-10"/>));
    expect(host.querySelector('.pay-list').closest('details')).toBeNull();
    expect(host.querySelector('.pay-list').textContent).toContain('10/24');
    await act(()=>host.querySelector('.pay-list button').click());
    expect(host.querySelector('.pay-detail').textContent).toContain('8時間');
    expect(host.querySelector('select[aria-label="集計期間"]').value).toBe('2026-10');
  }finally{await act(()=>root.unmount());}
});
