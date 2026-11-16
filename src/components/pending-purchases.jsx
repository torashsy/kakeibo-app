import React from "react";
import { purchaseLabel } from "../spending-groups";
import { yen } from "../utils";

export function PendingPurchases({ rows }) {
  if (!rows?.length) return null;
  const net = -rows.reduce((sum, row) => sum + row.amount, 0);
  return <details className="pending-purchases">
    <summary className="amount-summary"><span>用途未確認 {rows.length}件</span><b>{yen(net)}</b></summary>
    <div className="spend-transactions">{[...rows].sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).map(row=>
      <div key={row.id}><time dateTime={row.date}>{row.date.slice(5).replace("-", "/")}</time>
        <span>{purchaseLabel(row)}</span><b>{row.amount>0 && "返金 "}{yen(Math.abs(row.amount))}</b></div>
    )}</div>
  </details>;
}
