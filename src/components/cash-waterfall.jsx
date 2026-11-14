import React from "react";
import { yen } from "../utils";

function status(total, actual) {
  if (actual == null || total === 0) return "";
  if (actual === total) return "実績";
  return actual === 0 ? "予定" : "実績＋予定";
}

export function CashWaterfall({ income, expense, net, actualIncome, actualSpend }) {
  const high = Math.max(0, income, net);
  const low = Math.min(0, income, net);
  const y = value => 10 + 104 * (high - value) / (high - low || 1);
  const steps = [
    { label:"収入", start:0, end:income, value:income, status:status(income, actualIncome), fill:"var(--income)" },
    { label:"支出", start:income, end:net, value:-expense, status:status(expense, actualSpend), fill:"var(--muted)" },
    { label:net < 0 ? "赤字" : net > 0 ? "黒字" : "差引", start:0, end:net, value:net, fill:net < 0 ? "var(--expense)" : "var(--income)" },
  ];
  return <figure className="net-bridge">
    <svg viewBox="0 0 300 125" role="img" aria-label={steps.map(s=>s.label+" "+yen(s.value)).join("、")}>
      <line x1="19" x2="300" y1={y(0)} y2={y(0)} stroke="var(--muted)"/>
      <text x="0" y={y(0)+4} fill="var(--muted)" fontSize="10">0円</text>
      {steps.map((step,i)=>{
        const x = 26 + i*100;
        return <g key={step.label}>
          {i<2 && <line x1={x+48} x2={x+100} y1={y(step.end)} y2={y(step.end)} stroke="var(--muted)" strokeDasharray="3 3"/>}
          <rect x={x} y={Math.min(y(step.start),y(step.end))} width="48" height={Math.abs(y(step.start)-y(step.end))} fill={step.fill}/>
        </g>;
      })}
    </svg>
    <figcaption>{steps.map(s=><div key={s.label}><span>{s.label} <small>{s.status}</small></span><b style={{color:s.label==="赤字"?"var(--expense)":undefined}}>{yen(s.value)}</b></div>)}</figcaption>
  </figure>;
}
