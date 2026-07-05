import React, { useMemo, useState } from "react";
import { MUTED, RED } from '../theme.js';
import { yen, num, ymLabel, uid, addMonth } from '../utils.js';
import { styles } from '../styles.js';

export function Cards({ cards, debt, ym, entries, onSaveCards, onSaveDebt, onRemoveCard }) {
  const [view, setView] = useState("debt");
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.viewToggle}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "debt" ? styles.viewToggleActive : {}) }} onClick={() => setView("debt")}>残債</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "list" ? styles.viewToggleActive : {}) }} onClick={() => setView("list")}>カード一覧</button>
      </div>
      {view === "debt" ? <DebtTable cards={cards} debt={debt} ym={ym} onSaveDebt={onSaveDebt} /> : <CardList cards={cards} onSaveCards={onSaveCards} onRemoveCard={onRemoveCard} />}
    </div>
  );
}

export function DebtTable({ cards, debt, ym, onSaveDebt }) {
  const monthsCols = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonth(ym, i)), [ym]);
  const remaining = (name) => { const s = debt[name] || {}; return Object.entries(s).filter(([m]) => m >= ym).reduce((a, [, v]) => a + (v || 0), 0); };
  const totalRemaining = cards.reduce((a, c) => a + remaining(c.name), 0);
  const [edit, setEdit] = useState(null);
  const openEdit = (name, month) => setEdit({ name, month, value: (debt[name]?.[month] ?? "").toString() });
  const commitEdit = () => {
    const v = edit.value === "" ? null : parseFloat(edit.value);
    const next = { ...debt, [edit.name]: { ...(debt[edit.name] || {}) } };
    if (v == null || isNaN(v) || v === 0) delete next[edit.name][edit.month]; else next[edit.name][edit.month] = v;
    onSaveDebt(next); setEdit(null);
  };
  return (
    <div>
      <div style={styles.debtSummary}><span style={{ fontSize: 13, color: MUTED }}>残債合計（{ymLabel(ym)}以降）</span><span style={{ fontSize: 22, fontWeight: 800, color: RED }}>{yen(totalRemaining)}</span></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>各月の支払予定額。セルをタップで編集。横スクロール可。</div>
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>カード</th>{monthsCols.map((m) => <th key={m} style={styles.th}>{parseInt(m.split("-")[1], 10)}月</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>残債</th></tr></thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td style={{ ...styles.td, ...styles.tdSticky }}>{c.name}</td>
                {monthsCols.map((m) => <td key={m} style={styles.tdNum}><button style={styles.cellBtn} onClick={() => openEdit(c.name, m)}>{debt[c.name]?.[m] ? num(debt[c.name][m]) : "·"}</button></td>)}
                <td style={{ ...styles.tdNum, ...styles.tdTotalCell }}>{num(remaining(c.name))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.miniSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetTitle}>{edit.name}・{ymLabel(edit.month)}の支払額</div>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} placeholder="0" style={styles.amountInput} autoFocus /></div>
            <button style={styles.saveBtn} onClick={commitEdit}>保存</button>
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CardList({ cards, onSaveCards, onRemoveCard }) {
  const [edit, setEdit] = useState(null);
  const commit = () => {
    if (!edit.name.trim()) return;
    const next = edit.id ? cards.map((c) => (c.id === edit.id ? edit : c)) : [...cards, { ...edit, id: uid() }];
    onSaveCards(next); setEdit(null);
  };
  return (
    <div>
      <div style={styles.detailHead}><span>所有カード（{cards.length}枚）</span><button style={styles.addBtn} onClick={() => setEdit({ name: "", brand: "", note: "" })}>＋ 追加</button></div>
      <div style={styles.detailCard}>
        {cards.map((c) => (
          <button key={c.id} style={styles.cardListRow} onClick={() => setEdit({ ...c })}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</span>
              {c.note && <span style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{c.note}</span>}
            </span>
            <span style={styles.brandTag}>{c.brand || "—"}</span>
          </button>
        ))}
        {cards.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 6 }}>まだカードがありません</div>}
      </div>
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>{edit.id ? "カードを編集" : "カードを追加"}</div>
            <label style={styles.fieldLabel}>カード名</label>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="例）楽天カード" style={styles.textInput} autoFocus />
            <label style={styles.fieldLabel}>ブランド</label>
            <div style={styles.optionRow}>{["VISA", "Master", "JCB", "AMEX", "Diners"].map((b) => <button key={b} style={{ ...styles.optionChip, ...(edit.brand === b ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, brand: b })}>{b}</button>)}</div>
            <label style={styles.fieldLabel}>メモ（任意）</label>
            <input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="正式名称や用途など" style={styles.textInput} />
            <button style={{ ...styles.saveBtn, opacity: edit.name.trim() ? 1 : 0.4 }} onClick={commit} disabled={!edit.name.trim()}>{edit.id ? "更新する" : "追加する"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={() => { onRemoveCard({ id: edit.id, name: edit.name }); setEdit(null); }}>このカードを削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
