import {normalizePoints,daysBetween,localDay,validDay} from './deadlines';

export const requiredPointServices=[
  {id:'rakuten',name:'楽天',unit:'pt',matches:p=>/楽天/.test(p.name)},
  {id:'jal',name:'JAL',unit:'mile',matches:p=>p.pointSync?.key==='jal:main'||p.name==='JALマイル'},
  {id:'jre',name:'JRE POINT',unit:'pt',matches:p=>/^JRE POINT/.test(p.name)},
  {id:'ana',name:'ANA',unit:'mile',matches:p=>p.pointSync?.key==='ana:main'||p.name==='ANAマイル'},
  {id:'jcb',name:'JCB',unit:'pt',matches:p=>p.pointSync?.key==='jcb:gold'||/^JCB GOLD/.test(p.name)},
  {id:'v',name:'Vポイント',unit:'pt',matches:p=>p.pointSync?.key==='smcc:main'||p.name==='三井住友カード ポイント'},
];

export function pointManagement(points,collection={},checks={},today=localDay()) {
  collection=collection||{};checks=checks||{};
  const active=normalizePoints(points).filter(p=>!p.hidden&&p.status!=='used'&&p.kind!=='benefit');
  return requiredPointServices.map(service=>{
    const rows=active.filter(p=>service.matches(p)&&(p.unit||'pt')===service.unit);
    const dates=rows.map(p=>p.pointSync?.asOf||p.asOf).filter(validDay).sort();
    const asOf=dates.length===rows.length?dates[0]:null;
    const fetched=collection.requiredServices?.[service.id];
    const failed=collection.status==='failed'||fetched&&fetched.status!=='success';
    const status=failed?'取得待ち':!rows.length?'未取得':!asOf?'取得日未確認':daysBetween(today,asOf)>2?'更新待ち':'取得済み';
    const unknown=rows.filter(p=>p.amount>0&&p.expiryMode==='unknown').reduce((sum,p)=>sum+p.amount,0);
    const expiries=rows.filter(p=>p.amount>0&&p.expiryMode==='date').sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn));
    const expiring=expiries.filter(p=>p.expiresOn>=today&&daysBetween(p.expiresOn,today)<=30);
    const check=checks[service.id];
    const verified=check&&check.evidence&&validDay(check.asOf)&&check.asOf<=today&&Array.isArray(check.expiries)?check:null;
    return {...service,rows,amount:rows.length?rows.reduce((sum,p)=>sum+p.amount,0):null,asOf,status,unknown,expiries,expiring,
      reason:failed?(collection.status==='failed'?'接続失敗・前回残高を保持':fetched.reason):'',
      expiryCheck:verified,
      linkedIssue:service.id==='v'?(collection.issues||[]).find(i=>i.source==='Vポイント(V会員番号)')?.reason:null};
  });
}
