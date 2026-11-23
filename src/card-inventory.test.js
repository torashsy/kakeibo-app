import {it,expect} from 'vitest';
import {cardInventory} from './card-inventory';
it('keeps registration counts separate from issuer labels and does not manufacture fees or cards',()=>{
 const cards=[{name:'Issuer',annualFee:11000},{name:'Unknown'}];
 const transactions={a:{id:'mf-card:a',account:'Issuer A',date:'2026-11-01'},b:{id:'mf-card:b',account:'Issuer B',date:'2026-11-02'},c:{id:'mf-card:c',account:'Issuer A',date:'2026-11-10'},d:{id:'bank:d',account:'Bank',date:'2026-11-20'}};
 const before=JSON.stringify({cards,transactions});const view=cardInventory(cards,transactions);
 expect(view.registered).toBe(2);expect(view.annualFees).toBe(11000);expect(view.feeMonthsMissing).toBe(1);
 expect(view.sources).toEqual([{name:'Issuer A',lastUsed:'2026-11-10'},{name:'Issuer B',lastUsed:'2026-11-02'}]);
 expect(JSON.stringify({cards,transactions})).toBe(before);
});
it('separates actual card annual fees from merchant memberships and excludes bank records',()=>{
 const r=cardInventory([],{ 'mf-card:a':{account:'VIEW',date:'2026-10-31',amount:-11000,description:'カード年会費'},'mf-card:b':{account:'JAL',date:'2026-07-13',amount:-500,description:'TOHO-ONE 年会費'},'bank:c':{account:'Bank',date:'2026-11-01',amount:-100,description:'カード年会費'}});
 expect(r.feeCharges).toEqual([{id:'mf-card:a',name:'VIEW',date:'2026-10-31',amount:11000}]);expect(r.annualFees).toBe(0);
});
