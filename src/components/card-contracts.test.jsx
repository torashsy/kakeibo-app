// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import {CardList} from './cards';
it('shows individual contracts and fee conditions without manufacturing paid status or new accounting cards',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);let writes=0;
 const audit={checkedAt:'2026-11-23',cards:[{id:'a',name:'Issuer Gold JCB',issuer:'Issuer',status:'activity',evidenceDate:'2026-11-22',fee:{label:'優遇未確認',condition:'招待入会で無料'}},{id:'b',name:'Issuer Digital',issuer:'Issuer',status:'issued',fee:{label:'年会費 ¥0',serviceFee:{amount:1650,summary:'利用がない場合'}},evidence:[{label:'invalid URL',url:'javascript:alert(1)'}]},{id:'c',name:'Old contract',status:'closed'}],issues:[{id:'unmapped',title:'対応未確定',detail:'集計名の対応を調査中'}]};
 try{
 await act(()=>root.render(<CardList cards={[{id:'aggregate',name:'Issuer'}]} contractAudit={audit} onSaveCards={()=>writes++} onRemoveCard={()=>writes++}/>));
 expect(host.textContent).toContain('現在の保有総数は未確定');expect(host.textContent).toContain('招待入会で無料');expect(host.textContent).toContain('未利用時');expect(host.textContent).toContain('1,650');
 expect(host.querySelector('a[href^="javascript:"]')).toBeNull();
 const details=[...host.querySelectorAll('details')].find(d=>d.querySelector(':scope > summary')?.textContent.includes('集計・支払設定'));
 expect(details.open).toBe(false);
 await act(()=>{details.open=true;[...host.querySelectorAll('button')].find(b=>b.textContent.startsWith('Issuer用途')).click();});
 expect(host.textContent).toContain('カードを編集');expect(writes).toBe(0);
 }finally{await act(()=>root.unmount());}
});
