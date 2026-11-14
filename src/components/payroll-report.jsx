import React, { useState } from "react";
import { yen } from "../utils";
import { styles } from "../styles";
import "./payroll-report.css";

const money = value => Number(value).toLocaleString("ja-JP");
function deductionGroup(label) {
  if (/所得税|住民税|年末調整/.test(label)) return "税金";
  if (/健康保険|厚生年金|雇用保険|介護保険|子育て支援金|社保調整/.test(label)) return "社会保険";
  return "その他控除";
}
function AmountTable({ title, items, total }) {
  return <table className="pay-items"><caption>{title}</caption><tbody>
    {Object.entries(items || {}).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{yen(value)}</td></tr>)}
  </tbody><tfoot><tr><th scope="row">合計</th><td>{yen(total)}</td></tr></tfoot></table>;
}
export function PayrollReport({ slips }) {
  const [choice, setChoice] = useState("");
  const [expanded, setExpanded] = useState("");
  const all = Object.values(slips || {}).sort((a,b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
  const years = [...new Set(all.map(s => s.date.slice(0,4)))];
  if (!years.length) return null;
  const year = years.includes(choice) ? choice : years[0];
  const rows = all.filter(s => s.date.startsWith(year)).map(s => {
    const groups = { 税金: 0, 社会保険: 0, その他控除: 0 };
    for (const [name, amount] of Object.entries(s.withholdings || {})) groups[deductionGroup(name)] += amount;
    return { ...s, ...groups };
  });
  const total = key => rows.reduce((sum,s) => sum + s[key], 0);
  const metrics = [["支給総額","gross"],["給与から引かれた税金","税金"],["社会保険料","社会保険"],["控除合計","deductions"]];
  return <section className="pay-report" style={styles.detailCard} aria-label="給与・賞与の年間集計">
    <header><h3>給与・賞与</h3><select aria-label="支給年" value={year} onChange={e=>{setChoice(e.target.value);setExpanded("");}}>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></header>
    <div className="pay-hero"><small>年間手取り</small><strong>{yen(total("net"))}</strong>
    <small>{rows.at(-1).date.slice(5).replace("-","/")}〜{rows[0].date.slice(5).replace("-","/")} 支給分 · 明細{rows.length}件</small></div>
    <details className="pay-breakdown"><summary>税金・社会保険料と支給明細</summary>
    <dl>{metrics.map(([label,key])=><div key={key}><dt>{label}</dt><dd>{yen(total(key))}</dd></div>)}</dl>
    <table className="pay-list"><caption>支給日別の明細（金額は円）</caption>
      <thead><tr><th>支給日</th><th>支給額</th><th>控除額</th><th>手取り</th></tr></thead><tbody>
      {rows.map(s=>{const id=s.date+s.kind;return <React.Fragment key={id}><tr>
        <th scope="row"><button aria-expanded={expanded===id} onClick={()=>setExpanded(expanded===id?"":id)}>{s.date.slice(5).replace("-","/")}<small>{s.kind} {expanded===id?"▴":"▾"}</small></button></th>
        <td>{money(s.gross)}</td><td>{money(s.deductions)}</td><td><b>{money(s.net)}</b></td></tr>
        {expanded===id && <tr><td colSpan={4} className="pay-detail"><AmountTable title="支給内訳" items={s.earnings} total={s.gross}/><AmountTable title="控除内訳" items={s.withholdings} total={s.deductions}/>{s.overtimeHours!=null && <p>時間外割増時間　{s.overtimeHours}時間</p>}</td></tr>}</React.Fragment>})}
    </tbody></table>
    </details>
  </section>;
}
