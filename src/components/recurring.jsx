import React, { useState, lazy, Suspense } from "react";
import { styles } from '../styles.js';
import { Subs } from './subs.jsx';
import { DebtTable } from './cards.jsx';
const Contracts = lazy(() => import('./contracts.jsx').then(module => ({ default: module.Contracts })));

// 定期費タブ。「決まって出ていくお金」を一箇所に集約する。
//  - サブスク/通信費などの定期支払い(Subs): 解約検討・月/年換算・更新日の管理
//  - 分割払い(残債 DebtTable): 決まった将来の出費という点でサブスクと同じ性質なのでここに同居
// いずれも計画タブの「固定費」の土台になる参照情報で、収支の実績集計そのものには影響しない。
export function Recurring({ subs, onSaveSubs, contracts = [], onSaveContracts, onCommitContracts, cards, debt, ym, onSaveDebt, initialView = "subs" }) {
  const [view, setView] = useState(initialView);
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.viewToggle}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "subs" ? styles.viewToggleActive : {}) }} onClick={() => setView("subs")}>定期支払い</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "debt" ? styles.viewToggleActive : {}) }} onClick={() => setView("debt")}>分割払い</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "contracts" ? styles.viewToggleActive : {}) }} onClick={() => setView("contracts")}>回線・端末</button>
      </div>
      {view === "subs" && <Subs subs={subs} onSave={onSaveSubs} cards={cards} ym={ym} />}
      {view === "debt" && <DebtTable cards={cards} debt={debt} ym={ym} onSaveDebt={onSaveDebt} />}
      {view === "contracts" && <Suspense fallback={<div style={{ padding: 16, color: "var(--muted)" }}>契約を読み込み中…</div>}><Contracts contracts={contracts} subs={subs} cards={cards} ym={ym} onSaveContracts={onSaveContracts} onSaveSubs={onSaveSubs} onCommit={onCommitContracts} /></Suspense>}
    </div>
  );
}
