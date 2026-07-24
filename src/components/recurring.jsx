import React, { useState } from "react";
import { MUTED } from '../theme.js';
import { styles } from '../styles.js';
import { Subs } from './subs.jsx';
import { DebtTable } from './cards.jsx';

// 定期費タブ。「決まって出ていくお金」を一箇所に集約する。
//  - サブスク/通信費などの定期支払い(Subs): 解約検討・月/年換算・更新日の管理
//  - 分割払い(残債 DebtTable): 決まった将来の出費という点でサブスクと同じ性質なのでここに同居
// いずれも計画タブの「固定費」の土台になる参照情報で、収支の実績集計そのものには影響しない。
export function Recurring({ subs, onSaveSubs, cards, debt, ym, onSaveDebt }) {
  const [view, setView] = useState("subs");
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.viewToggle}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "subs" ? styles.viewToggleActive : {}) }} onClick={() => setView("subs")}>定期支払い</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "debt" ? styles.viewToggleActive : {}) }} onClick={() => setView("debt")}>分割払い</button>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 10px", lineHeight: 1.6 }}>
        {view === "subs"
          ? "毎月・毎年決まって出ていく支払い。解約の検討や、計画の固定費の目安に使えます。"
          : "カードの分割払い(残債)の残り。決まった将来の出費としてここで管理します。"}
      </div>
      {view === "subs" ? <Subs subs={subs} onSave={onSaveSubs} cards={cards} /> : <DebtTable cards={cards} debt={debt} ym={ym} onSaveDebt={onSaveDebt} />}
    </div>
  );
}
