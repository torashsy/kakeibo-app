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
  const [choice, setChoice] = useState(ym?.slice(0,4) || "");
  const [expanded, setExpanded] = useState("");
  const all = Object.values(slips || {}).sort((a,b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
  const [selectedYear,setSelectedYear] = useState(ym?.slice(0,4));
  const years = [...new Set(all.map(s => s.date.slice(0,4)))];
  if (!years.length) return <p>給与明細はまだありません。</p>;
  const year = years.includes(selectedYear) ? selectedYear : years[0];
  const rows = all.filter(s => s.date.startsWith(year));
  const months = [...new Set(rows.map(r=>r.date.slice(0,7)))];
  const period = choice.length === 7 ? choice : choice === "annual" ? "" : months.includes(ym) ? ym : months[0];
  const active = period ? rows.filter(r=>r.date.startsWith(period)) : rows;
  const total = key => active.reduce((sum,r)=>sum+r[key],0);
  const deductions = new Map();
  for (const r of active) for (const [name,value] of Object.entries(r.withholdings || {}))
    deductions.set(name,(deductions.get(name)||0)+value);
  const delta = total("gross")-total("net")-[...deductions.values()].reduce((a,b)=>a+b,0);
  if (delta) deductions.set("明細差額",delta);
  return <section className="statement pay-report"><header><h3>給与・賞与</h3><div>
    <select aria-label="支給年" value={year} onChange={e=>{setSelectedYear(e.target.value);setChoice("annual");setExpanded("");}}>{years.map(y=><option key={y}>{y}</option>)}</select>
    <select aria-label="集計期間" value={period || "annual"} onChange={e=>setChoice(e.target.value)}><option value="annual">年間</option>{months.map(m=><option key={m} value={m}>{Number(m.slice(5))}月</option>)}</select></div></header>
    <div className="statement-line gross"><span>額面</span><b>{yen(total("gross"))}</b></div>
    {total("gross") > 0 && total("net") >= 0 && total("net") <= total("gross") && <div className="pay-split">
      <div aria-hidden="true"><i style={{width:(100*total("net")/total("gross"))+"%"}}/></div>
      <small>手取り {Math.round(100*total("net")/total("gross"))}%</small><small>控除 {yen(total("gross")-total("net"))}</small>
    </div>}
    <div className="statement-label">差し引かれたもの</div>
    {[...deductions].filter(([,v])=>v).sort((a,b)=>b[1]-a[1]).map(([name,value])=><div className="statement-line deduction" key={name}><span>{name}</span><b>{value>0?"−":"＋"}{yen(Math.abs(value))}</b></div>)}
    <div className="statement-line take-home"><span>手取り</span><strong>{yen(total("net"))}</strong></div>
    <details className="pay-breakdown"><summary>支給明細</summary>
    <table className="pay-list"><caption>支給日別の明細（金額は円）</caption>
      <thead><tr><th>支給日</th><th>支給額</th><th>控除額</th><th>手取り</th></tr></thead><tbody>
      {active.map(s=>{const id=s.date+s.kind;return <React.Fragment key={id}><tr>
        <th scope="row"><button aria-expanded={expanded===id} onClick={()=>setExpanded(expanded===id?"":id)}>{s.date.slice(5).replace("-","/")}<small>{s.kind} {expanded===id?"▴":"▾"}</small></button></th>
        <td>{money(s.gross)}</td><td>{money(s.deductions)}</td><td><b>{money(s.net)}</b></td></tr>
        {expanded===id && <tr><td colSpan={4} className="pay-detail"><AmountTable title="支給内訳" items={s.earnings} total={s.gross}/><AmountTable title="控除内訳" items={s.withholdings} total={s.deductions}/>{s.overtimeHours!=null && <p>時間外割増時間　{s.overtimeHours}時間</p>}</td></tr>}</React.Fragment>})}
    </tbody></table>
    </details>
  </section>;
}
