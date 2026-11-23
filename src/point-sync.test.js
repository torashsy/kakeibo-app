import {expect,it} from 'vitest';
import {reconcilePoints} from './point-sync';
import {deadlineEvents} from './deadlines';
const today='2026-11-20';
const point={id:'program:account',name:'Example',amount:493,unit:'pt',asOf:'2026-11-16',evidence:'mail:1',expiresOn:'2026-12-12'};
const feed=p=>({pointBalances:Object.fromEntries(p.map(x=>[x.id,x]))});
it('replaces older balances instead of summing snapshots and preserves unknown expiry',()=>{
 const first=reconcilePoints([],feed([point]),today);
 const newer=feed([{...point,amount:400,asOf:'2026-11-18',expiresOn:''}]);
 const next=reconcilePoints(first,newer,today);
 expect(next).toHaveLength(1);expect(next[0]).toMatchObject({amount:400,expiryMode:'unknown',expiresOn:''});
 expect(reconcilePoints(next,feed([point]),today)).toEqual(next);
 expect(reconcilePoints(next,newer,today)).toEqual(next);
});
it('keeps different expiry lots and miles separate without currency conversion',()=>{
 const points=reconcilePoints([],feed([point,{...point,id:'limited',amount:100,expiresOn:'2026-12-31'},{...point,id:'miles',amount:48059,unit:'mile'}]),today);
 expect(points).toHaveLength(3);
 expect(deadlineEvents([],points,today).find(e=>e.name==='Example'&&e.unit==='mile').amount).toBe(48059);
});
it('treats gift notifications as receipt deadlines, never as the point balance',()=>{
 const [gift]=reconcilePoints([],feed([{...point,kind:'benefit',amount:6000,unit:'yenEquivalent'}]),today);
 expect(gift.kind).toBe('benefit');
 expect(deadlineEvents([],[gift],today)[0]).toMatchObject({kind:'受取期限',unit:'yenEquivalent',amount:6000});
 expect(deadlineEvents([],[{...gift,status:'used'}],today)).toEqual([]);
});
it('preserves manual edits, receipt confirmation, hidden rows and unrelated entries',()=>{
 const [first]=reconcilePoints([],feed([point]),today);
 const saved=[{...first,amount:300,note:'my note',hidden:true,status:'used'},{id:'manual',name:'Other',amount:10}];
 const next=reconcilePoints(saved,feed([{...point,amount:200,asOf:'2026-11-18'}]),today);
 expect(next[0]).toMatchObject({amount:300,note:'my note',hidden:true,status:'used'});
 expect(next[1]).toEqual(saved[1]);expect(deadlineEvents([],next,today)).toEqual([]);
});
it('ignores future, invalid and evidence-free observations without clearing data on outage',()=>{
 const bad=[{...point,id:'future',asOf:'2027-01-01'},{...point,id:'bad',amount:-1},{...point,id:'no',evidence:''},{...point,id:'unit',unit:'yen'},{...point,id:'date',asOf:'2026-02-30'}];
 expect(reconcilePoints([],feed(bad),today)).toEqual([]);
 const saved=[{id:'manual',name:'Other',amount:10}];expect(reconcilePoints(saved,null,today)).toBe(saved);
 const before=JSON.stringify(point);reconcilePoints([],feed([point]),today);expect(JSON.stringify(point)).toBe(before);
});

it('selects current expiry lots from successful source snapshots without erasing history or user edits',()=>{
 const previous={...point,sourceKey:'source:example',sourceUpdatedAt:'2026-11-16T07:00:00+09:00'};
 const initial=reconcilePoints([],feed([previous]),today);
 const next={...previous,id:'new-lot',asOf:'2026-11-18',sourceUpdatedAt:'2026-11-18T07:00:00+09:00',amount:100,expiresOn:'2027-01-01'};
 const update={...feed([previous,next]),pointCollection:{sources:{'source:example':{sourceUpdatedAt:next.sourceUpdatedAt,pointIds:[next.id]}}}};
 const snapshot=JSON.stringify(update);
 expect(reconcilePoints(initial,update,today).map(r=>r.pointSync.key)).toEqual(['new-lot']);
 expect(reconcilePoints([],update,today).map(r=>r.pointSync.key)).toEqual(['new-lot']);
 expect(reconcilePoints([{...initial[0],note:'manual correction'}],update,today)).toHaveLength(2);
 expect(JSON.stringify(update)).toBe(snapshot);
 expect(reconcilePoints(initial,{...update,pointCollection:{sources:{}}},today)).toHaveLength(2);
});

it('does not roll back points to an earlier acquisition within the same day',()=>{
 const latest={...point,sourceUpdatedAt:'2026-11-16T10:00:00+09:00'};
 const saved=reconcilePoints([],feed([latest]),today);
 expect(reconcilePoints(saved,feed([{...latest,sourceUpdatedAt:'2026-11-16T07:00:00+09:00',amount:10}]),today)).toEqual(saved);
});
