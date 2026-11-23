import {it,expect} from 'vitest';
import {pointManagement} from './point-management';
const today='2026-11-23';
const row={id:'x',name:'JALマイル',amount:123,unit:'mile',asOf:today};
it('always covers all six services without treating absent data as zero',()=>{
 const result=pointManagement([row],null,null,today);
 expect(result).toHaveLength(6);expect(result.find(s=>s.id==='jal').amount).toBe(123);
 expect(result.find(s=>s.id==='ana')).toMatchObject({amount:null,status:'未取得'});
});
it('keeps prior balances with explicit failure or stale markers',()=>{
 expect(pointManagement([row],{status:'failed'},{},today).find(s=>s.id==='jal')).toMatchObject({amount:123,status:'取得待ち',asOf:today});
 expect(pointManagement([{...row,asOf:'2026-11-01'}],{},{},today).find(s=>s.id==='jal').status).toBe('更新待ち');
});
it('keeps expiry notices separate from balances and rejects future notices',()=>{
 const check={asOf:'2026-11-16',evidence:'mail',expiries:[{date:'2027-01-31',amount:0}]};
 const result=pointManagement([row],{},{jal:check},today).find(s=>s.id==='jal');
 expect(result.amount).toBe(123);expect(result.unknown).toBe(123);expect(result.expiryCheck).toEqual(check);
 expect(pointManagement([row],{},{jal:{...check,asOf:'2027-01-01'}},today).find(s=>s.id==='jal').expiryCheck).toBeNull();
});
