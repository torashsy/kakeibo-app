import { purchaseLabel, spendingGroup } from "../spending-groups";
import { classifyCardRows } from "../card-purposes";
import React, { useMemo, useState } from 'react';
import { bankTransactions } from '../bank-feed';
import { yen } from '../utils';
import { PendingPurchases } from './pending-purchases';

export function MonthlyCardSpending({ snapshot }) {
  const rows = useMemo(() => classifyCardRows(bankTransactions(snapshot).filter(row => row.id.startsWith('mf-card:'))), [snapshot]);
  const months = [...new Set(rows.map(row => row.date.slice(0, 7)))];
  const [selection, setSelection] = useState('');
  if (!months.length) return null;
  const month = months.includes(selection) ? selection : months[0];
  const monthly = rows.filter(row => row.date.startsWith(month) && spendingGroup(row));

  const byCategory = new Map();
  for (const row of monthly) {
    const label = spendingGroup(row)[0];
    if (!byCategory.has(label)) byCategory.set(label, []);
    byCategory.get(label).push(row);
  }
  return <section aria-label="カードの月別内訳" style={{ margin: '14px 0', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
    <strong>カードの月別内訳</strong>
    <label style={{ display: 'block', margin: '10px 0' }}>対象月　<select value={month} onChange={e => setSelection(e.target.value)}>
      {months.map(m => <option key={m}>{m}</option>)}
    </select></label>
    <small>確定明細 {monthly.length}件・返金を差し引いた利用額</small>
    {[...byCategory.keys()].filter(category => category !== "用途未確認").map(category => {
      const items = byCategory.get(category);
      const total = -items.reduce((sum, row) => sum + row.amount, 0);
      return <details key={month + category} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
        <summary className="amount-summary"><span>{category} <small>{items.length}件</small></span><b>{yen(total)}</b></summary>
        {items.map(row => <div className="dated-detail" key={row.id} style={{ padding: '5px 0', fontSize: 13, overflowWrap: 'anywhere' }}>
          <time>{row.date.slice(5).replace("-","/")}</time><span>{purchaseLabel(row)} <small>{row.account}</small></span><b>{yen(-row.amount)}</b>
        </div>)}
      </details>;
    })}
    <PendingPurchases key={month} rows={byCategory.get("用途未確認")}/>
  </section>;
}
