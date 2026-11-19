import React, { useState } from "react";
import { yen } from "../utils";
import { styles } from "../styles";
import "./payroll-report.css";

const money = value => Number(value).toLocaleString("ja-JP");
function AmountTable({ title, items, total }) {
  return <table className="pay-items"><caption>{title}</caption><tbody>
    {Object.entries(items || {}).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{yen(value)}</td></tr>)}
  </tbody><tfoot><tr><th scope="row">合計</th><td>{yen(total)}</td></tr></tfoot></table>;
}
export function PayrollReport({ slips, ym }) {
  const [choice, setChoice] = useState(ym || "annual");
  const [expanded, setExpanded] = useState("");
  const all = Object.values(slips || {}).sort((a,b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
  const [selectedYear,setSelectedYear] = useState(ym?.slice(0,4));
  const years = [...new Set(all.map(s => s.date.slice(0,4)))];
  if (!years.length) return <p>給与明細はまだありません。</p>;
  const year = selectedYear || years[0];
  const shownYears = [...new Set([year,...years])].sort().reverse();
  const rows = all.filter(s => s.date.startsWith(year));
  const months = [...new Set(rows.map(r=>r.date.slice(0,7)))];
  const period = choice.length === 7 ? choice : choice === "annual" ? "" : months.includes(ym) ? ym : months[0];
  const active = period ? rows.filter(r=>r.date.startsWith(period)) : rows;
  const total = key => active.reduce((sum,r)=>sum+r[key],0);
  const earnings = new Map();
  for (const slip of active) for (const [name,value] of Object.entries(slip.earnings || {}))
    earnings.set(name,(earnings.get(name) || 0) + value);
  const unitemized = total("gross") - [...earnings.values()].reduce((sum,value)=>sum+value,0);
  if (unitemized) earnings.set("支給内訳差額",unitemized);
  const deductions = new Map();
  for (const r of active) for (const [name,value] of Object.entries(r.withholdings || {}))
    deductions.set(name,(deductions.get(name)||0)+value);
  const delta = total("gross")-total("net")-[...deductions.values()].reduce((a,b)=>a+b,0);
  if (delta) deductions.set("明細差額",delta);
  return <section className="statement pay-report"><header className="pay-period"><div>
    <select aria-label="支給年" value={year} onChange={e=>{setSelectedYear(e.target.value);setChoice("annual");setExpanded("");}}>{shownYears.map(y=><option key={y}>{y}</option>)}</select>
    <select aria-label="集計期間" value={period || "annual"} onChange={e=>setChoice(e.target.value)}><option value="annual">年間</option>{[...new Set([...(period ? [period] : []),...months])].sort().reverse().map(m=><option key={m} value={m}>{Number(m.slice(5))}月</option>)}</select></div></header>
    {!active.length ? <p>この期間の給与明細はありません。<button className="plain-action" onClick={()=>{setSelectedYear(years[0]);setChoice(all[0].date.slice(0,7));}}>最新の明細を見る（{all[0].date}）</button></p> : <>
    <div className="statement-line take-home amount-hero"><span>{period ? Number(period.slice(5))+"月支給" : year+"年"}の手取り</span><strong>{yen(total("net"))}</strong></div>
    <figure className="pay-composition" aria-label="額面に占める手取りと控除">
      <figcaption><span>額面</span><b>{yen(total("gross"))}</b></figcaption>
      {total("gross")>0 && total("net")>=0 && total("net")<=total("gross") && <div className="pay-band" aria-hidden="true">
        <i style={{width:100*total("net")/total("gross")+"%"}}/></div>}
      <div className="pay-key"><span>手取り{total("gross")>0 && " "+Math.round(100*total("net")/total("gross"))+"%"}</span>
        <span>控除　{yen(total("gross")-total("net"))}</span></div>
    </figure>
    <section className="deduction-list pay-earnings"><h4>支給</h4>
      {[...earnings].filter(([,value])=>value!==0).sort((a,b)=>b[1]-a[1]).map(([label,value])=>
        <div className="statement-line deduction" key={label}><span>{label}</span><b>{yen(value)}</b></div>)}
    </section>
    <section className="deduction-list"><h4>控除</h4>
    {[...deductions].filter(([,v])=>v).sort((a,b)=>b[1]-a[1]).map(([name,value])=><div className="statement-line deduction" key={name}><span>{name}</span><b>{value>0?"−":"＋"}{yen(Math.abs(value))}</b></div>)}

    </section><section className="pay-breakdown">
    <table className="pay-list"><caption>支給日別（円）</caption>
      <thead><tr><th>支給日</th><th>支給額</th><th>控除額</th><th>手取り</th></tr></thead><tbody>
      {active.map(s=>{const id=s.date+s.kind;return <React.Fragment key={id}><tr>
        <th scope="row"><button aria-expanded={expanded===id} onClick={()=>setExpanded(expanded===id?"":id)}><span className="disclosure-chevron" aria-hidden="true">›</span> {s.date.slice(5).replace("-","/")}<small>{s.kind}</small></button></th>
        <td>{money(s.gross)}</td><td>{money(s.deductions)}</td><td><b>{money(s.net)}</b></td></tr>
        {expanded===id && <tr><td colSpan={4} className="pay-detail"><AmountTable title="支給内訳" items={s.earnings} total={s.gross}/><AmountTable title="控除内訳" items={s.withholdings} total={s.deductions}/>{s.overtimeHours!=null && <p>時間外割増時間　{s.overtimeHours}時間</p>}</td></tr>}</React.Fragment>})}
    </tbody></table>
    </section></>}
  </section>;
}
