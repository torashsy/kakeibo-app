import React, { useMemo, useState } from "react";
import { MUTED, RED } from '../theme.js';
import { yen, num, ymLabel, uid, addMonth, debtValueTotal } from '../utils';
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
  const columns = useMemo(() => {
    const [year, month] = ym.split("-").map(Number);
    const fiscalYear = month >= 4 ? year : year - 1;
    const months = Array.from({ length: month >= 4 ? 16 - month : 4 - month }, (_, i) => addMonth(ym, i));
    const years = Array.from({ length: 5 }, (_, i) => `FY:${fiscalYear + i + 1}`);
    return [...months, ...years];
  }, [ym]);
  const currentFiscalYear = Number(ym.slice(0, 4)) - (Number(ym.slice(5, 7)) < 4 ? 1 : 0);
  const isFuturePeriod = (period) => period.startsWith("FY:")
    ? Number(period.slice(3)) > currentFiscalYear
    : period.includes("-") ? period >= ym : Number(period) >= Number(ym.slice(0, 4));
  const remaining = (name) => Object.entries(debt[name] || {})
    .filter(([period]) => isFuturePeriod(period))
    .reduce((sum, [, value]) => sum + debtValueTotal(value), 0);
  const totalRemaining = cards.reduce((a, c) => a + remaining(c.name), 0);
  const [edit, setEdit] = useState(null);
  const openEdit = (name, period) => {
    const current = debt[name]?.[period];
    const items = current && typeof current === "object" && Array.isArray(current.items)
      ? current.items.map((item) => ({ id: item.id || uid(), label: item.label || "", amount: String(item.amount ?? "") }))
      : [{ id: uid(), label: "", amount: current == null ? "" : String(current) }];
    setEdit({ name, period, items });
  };
  const setItem = (id, patch) => setEdit((prev) => ({ ...prev, items: prev.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const commitEdit = () => {
    const items = edit.items
      .map((item) => ({ id: item.id, label: item.label.trim(), amount: Number(item.amount) || 0 }))
      .filter((item) => item.amount !== 0);
    const next = { ...debt, [edit.name]: { ...(debt[edit.name] || {}) } };
    if (!items.length) delete next[edit.name][edit.period];
    else next[edit.name][edit.period] = { items };
    onSaveDebt(next); setEdit(null);
  };
  return (
    <div>
      <div style={styles.debtSummary}><span style={{ fontSize: 13, color: MUTED }}>残債合計（{ymLabel(ym)}以降）</span><span style={{ fontSize: 22, fontWeight: 600, color: RED }}>{yen(totalRemaining)}</span></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>今年は月単位、次年度以降は年単位です。セルをタップすると内訳を入力できます。</div>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, width: 132 + (columns.length + 1) * 96 }}>
          <colgroup><col style={{ width: 132 }} />{columns.map((p) => <col key={"col-" + p} style={{ width: 96 }} />)}<col style={{ width: 96 }} /></colgroup>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>カード</th>{columns.map((p) => <th key={p} style={styles.th}>{p.startsWith("FY:") ? `${p.slice(3)}年度` : `${Number(p.slice(5))}月`}</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>残債</th></tr></thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td style={{ ...styles.td, ...styles.tdSticky }}>{c.name}</td>
                {columns.map((p) => <td key={p} style={styles.tdNum}><button style={{ ...styles.cellBtn, minWidth: 28, minHeight: 18, display: "block", width: "100%", textAlign: "right" }} onClick={() => openEdit(c.name, p)}>{debtValueTotal(debt[c.name]?.[p]) ? num(debtValueTotal(debt[c.name][p])) : " "}</button></td>)}
                <td style={{ ...styles.tdNum, ...styles.tdTotalCell }}>{num(remaining(c.name))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.miniSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetTitle}>{edit.name}・{edit.period.startsWith("FY:") ? `${edit.period.slice(3)}年度` : edit.period.includes("-") ? ymLabel(edit.period) : `${edit.period}年`}の残債内訳</div>
            {edit.items.map((item, index) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px 28px", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input value={item.label} onChange={(e) => setItem(item.id, { label: e.target.value })} placeholder={`内訳 ${index + 1}`} style={{ ...styles.textInput, margin: 0 }} autoFocus={index === 0} />
                <input type="number" inputMode="numeric" value={item.amount} onChange={(e) => setItem(item.id, { amount: e.target.value })} placeholder="0" style={{ ...styles.textInput, margin: 0, textAlign: "right" }} />
                <button style={styles.removeBtn} aria-label="内訳を削除" onClick={() => setEdit((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== item.id) }))}>×</button>
              </div>
            ))}
            <button style={styles.backupBtn} onClick={() => setEdit((prev) => ({ ...prev, items: [...prev.items, { id: uid(), label: "", amount: "" }] }))}>＋ 内訳を追加</button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13 }}><span>合計</span><strong>{yen(edit.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</strong></div>
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
    const card = { ...edit, annualFee: Number(edit.annualFee) || 0 };
    const next = edit.id ? cards.map((c) => (c.id === edit.id ? card : c)) : [...cards, { ...card, id: uid() }];
    onSaveCards(next); setEdit(null);
  };
  return (
    <div>
      <div style={styles.detailHead}><span>所有カード（{cards.length}枚）</span><button style={styles.addBtn} onClick={() => setEdit({ name: "", brand: "", note: "", annualFee: "" })}>＋ 追加</button></div>
      <div style={styles.detailCard}>
        {cards.map((c) => (
          <button key={c.id} style={styles.cardListRow} onClick={() => setEdit({ ...c })}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</span>
              {c.note && <span style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{c.note}</span>}
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <span style={styles.brandTag}>{c.brand || "—"}</span>
              <span style={{ fontSize: 11.5, color: Number(c.annualFee) > 0 ? MUTED : "var(--income)", fontVariantNumeric: "tabular-nums" }}>
                {Number(c.annualFee) > 0 ? `年会費 ${yen(c.annualFee)}` : "年会費 無料"}
              </span>
            </span>
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
            <label style={styles.fieldLabel}>年会費（円・任意）</label>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.annualFee ?? ""} onChange={(e) => setEdit({ ...edit, annualFee: e.target.value })} placeholder="0（無料）" style={styles.amountInput} /></div>
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
