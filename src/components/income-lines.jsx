import React from "react";
import { acctRole, parseTxnKey, plannedSalaryBreakdown, yen } from "../utils";

export function IncomeLines({ entries, forecast, plans, ym }) {
  const groups = new Map();
  const add = (group, label, amount) => {
    if (!amount) return;
    if (!groups.has(group)) groups.set(group,new Map());
    const rows = groups.get(group);
    rows.set(label,(rows.get(label) || 0) + amount);
  };
  const salaryActual = !forecast || forecast.salaryRecorded;
  const otherActual = !forecast || forecast.otherRecorded;
  for (const e of entries) {
    if (salaryActual && e.cat === "salary") add("実績",e.item,e.amount);
    if (otherActual && e.cat === "account" && acctRole(e.item) === "in")
      add("実績",e.note || parseTxnKey(e.src)?.desc || e.item,Math.abs(e.amount));
  }
  if (!salaryActual) {
    const parts = Object.entries(plannedSalaryBreakdown(plans,ym));
    if (parts.length && parts.reduce((sum,[,value])=>sum+value,0) === forecast.salaryIncome)
      parts.forEach(([label,value])=>add("予定",label,value));
    else add("予定","給与（手取り）",forecast.salaryIncome);
  }
  if (!otherActual) add("予定","その他入金",forecast.otherIncome);
  return <div className="income-lines">{groups.size ? [...groups].map(([group,rows])=>
    <section key={group}><h4>{group}</h4>{[...rows].filter(([,value])=>value!==0).sort((a,b)=>b[1]-a[1]).map(([label,value])=>
      <div key={label}><span>{label}</span><b>{yen(value)}</b></div>)}</section>) : <span>入金なし</span>}</div>;
}
