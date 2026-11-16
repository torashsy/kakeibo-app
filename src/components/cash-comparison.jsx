import React, { useState, useId } from "react";
import { yen } from "../utils";

export function CashComparison({ title, income, expense, net, actualIncome, actualSpend, incomeDetails }) {
  const [open,setOpen] = useState(false);
  const detailId = useId();
  const maximum = Math.max(Math.abs(income), Math.abs(expense), 1);
  const shared = Math.min(Math.abs(income), Math.abs(expense));
  const rows = [["収入", income, actualIncome], ["支出", expense, actualSpend]];
  return <figure className="cash-comparison">
    <figcaption>{title} <strong data-deficit={net < 0}>{net > 0 ? "+" : ""}{yen(net)}</strong></figcaption>
    {rows.map(([label, amount, actual]) => {
      const status = actual == null || amount === 0 ? "" : actual === amount ? "実績" : actual === 0 ? "予定" : "実績＋予定";
      const excess = Math.abs(amount) - shared;
      return <div className="cash-line" key={label}>
        {label==="収入" && incomeDetails ? <button type="button" aria-label="収入の内訳" aria-expanded={open} aria-controls={detailId} className="cash-toggle" onClick={()=>setOpen(!open)}><span><span className="disclosure-chevron" aria-hidden="true">›</span> {label} <small>{status}</small></span><b>{yen(amount)}</b></button> : <><span>{label} <small>{status}</small></span><b>{yen(amount)}</b></>}
        {amount > 0 && income >= 0 && expense >= 0 && <div className="cash-scale" aria-hidden="true">
          <i style={{width:100*shared/maximum+"%"}}/>
          {excess > 0 && <i className="cash-gap" data-deficit={net < 0} style={{width:100*excess/maximum+"%"}}/>}
        </div>}
        {label==="収入" && incomeDetails && <div className="cash-detail" id={detailId} hidden={!open}>{open && incomeDetails}</div>}
      </div>;
    })}
  </figure>;
}
