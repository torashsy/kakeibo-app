import React, { useMemo, useState } from "react";
import { INK, MUTED, ACCENT, GREEN, RED } from '../theme.js';
import { num, ymLabel, planMonths, fyStartOf, planLines, planValue, actualForLine } from '../utils.js';
import { styles } from '../styles.js';

// 計画 / 実績 / 差異 を月×項目で比較するビュー。収支計算(サマリ)とは別の計画レイヤー。
export function PlanView({ plans, onSave, config, cards, entries, memos, ym }) {
  const [mode, setMode] = useState("plan"); // plan | actual | diff
  const [edit, setEdit] = useState(null);

  const fyStart = fyStartOf(ym);
  const months = useMemo(() => planMonths(fyStart), [fyStart]);
  const lines = useMemo(() => planLines(config, cards), [config, cards]);
  const entriesByMonth = useMemo(() => {
    const m = {}; for (const mo of months) m[mo] = [];
    for (const e of entries) if (m[e.ym]) m[e.ym].push(e);
    return m;
  }, [entries, months]);

  const planOf = (key, mo) => planValue(plans, key, mo);
  const actualOf = (key, mo) => actualForLine(key, entriesByMonth[mo] || [], memos, mo);
  const cellOf = (key, mo) => (mode === "plan" ? planOf(key, mo) : mode === "actual" ? actualOf(key, mo) : actualOf(key, mo) - planOf(key, mo));

  const income = lines.filter((l) => l.group === "income");
  const expense = lines.filter((l) => l.group === "expense");
  const sumGroup = (grp, mo, which) => grp.reduce((a, l) => a + (which === "plan" ? planOf(l.key, mo) : actualOf(l.key, mo)), 0);
  const totalCell = (grp, mo) => (mode === "plan" ? sumGroup(grp, mo, "plan") : mode === "actual" ? sumGroup(grp, mo, "actual") : sumGroup(grp, mo, "actual") - sumGroup(grp, mo, "plan"));
  const netCell = (mo) => (mode === "plan" ? sumGroup(income, mo, "plan") - sumGroup(expense, mo, "plan") : mode === "actual" ? sumGroup(income, mo, "actual") - sumGroup(expense, mo, "actual") : (sumGroup(income, mo, "actual") - sumGroup(expense, mo, "actual")) - (sumGroup(income, mo, "plan") - sumGroup(expense, mo, "plan")));

  // 差異の色: 収入は多いほど良い(+緑)、支出は少ないほど良い(−緑)、収支は+緑
  const diffColor = (group, v) => (v === 0 ? MUTED : (group === "expense" ? (v <= 0 ? GREEN : RED) : (v >= 0 ? GREEN : RED)));
  const cellText = (v) => (v === 0 ? "" : (mode === "diff" && v > 0 ? "+" + num(v) : num(v)));
  const cellStyleFor = (group, v) => (mode === "diff" ? { color: diffColor(group, v) } : (v < 0 ? { color: RED } : {}));

  const mlabel = (mo) => parseInt(mo.split("-")[1], 10) + "月";
  const rows = [];
  rows.push({ kind: "head", label: "収入" });
  income.forEach((l) => rows.push({ kind: "row", line: l }));
  rows.push({ kind: "sub", label: "収入計", grp: income });
  rows.push({ kind: "head", label: "支出" });
  expense.forEach((l) => rows.push({ kind: "row", line: l }));
  rows.push({ kind: "sub", label: "支出計", grp: expense });
  rows.push({ kind: "net", label: "収支計" });

  const rowTotal = (r) => months.reduce((a, mo) => a + (r.kind === "row" ? cellOf(r.line.key, mo) : r.kind === "net" ? netCell(mo) : totalCell(r.grp, mo)), 0);

  const tableWidth = 132 + (months.length + 1) * 96;

  const openEdit = (line, mo) => {
    if (mode !== "plan") return;
    const l = plans && plans.lines && plans.lines[line.key];
    const ov = l && l.over && l.over[mo] != null ? String(l.over[mo]) : "";
    setEdit({ key: line.key, ym: mo, label: line.label, mlabel: ymLabel(mo), std: (l ? Number(l.std) || 0 : 0), value: ov });
  };
  const commitOver = () => {
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    const line = { ...(next.lines[edit.key] || { std: 0, over: {} }) };
    line.over = { ...(line.over || {}) };
    if (edit.value === "" || isNaN(Number(edit.value))) delete line.over[edit.ym];
    else line.over[edit.ym] = Number(edit.value);
    next.lines[edit.key] = line; onSave(next); setEdit(null);
  };
  const commitStd = () => {
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    const line = { ...(next.lines[edit.key] || { std: 0, over: {} }) };
    line.std = edit.value === "" ? 0 : Number(edit.value) || 0;
    line.over = { ...(line.over || {}) }; delete line.over[edit.ym];
    next.lines[edit.key] = line; onSave(next); setEdit(null);
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div style={styles.viewToggle}>
        {[["plan", "計画"], ["actual", "実績"], ["diff", "差異"]].map(([v, l]) => (
          <button key={v} style={{ ...styles.viewToggleBtn, ...(mode === v ? styles.viewToggleActive : {}) }} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>
        {fyStart}年4月〜{fyStart + 1}年3月。{mode === "plan" ? "セルをタップで計画を編集（この月／毎月の標準）。" : mode === "actual" ? "記録から自動集計した実績です。" : "実績−計画。緑=良い方向。"}横スクロール可。
      </div>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, width: tableWidth }}>
          <colgroup><col style={{ width: 132 }} />{months.map((mo) => <col key={"col-" + mo} style={{ width: 96 }} />)}<col style={{ width: 96 }} /></colgroup>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>項目</th>{months.map((mo) => <th key={mo} style={{ ...styles.th, ...(mo === ym ? { color: ACCENT } : {}) }}>{mlabel(mo)}</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>通期</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "head") return <tr key={i}><td colSpan={months.length + 2} style={styles.tdGroup}>{r.label}</td></tr>;
              const isSub = r.kind === "sub" || r.kind === "net";
              const grpKind = r.kind === "net" ? "net" : r.kind === "row" ? r.line.group : (r.grp === income ? "income" : "expense");
              return (
                <tr key={i}>
                  <td style={{ ...styles.td, ...styles.tdSticky, ...(isSub ? styles.tdSubLabel : {}) }}>{r.kind === "row" ? r.line.label : r.label}</td>
                  {months.map((mo) => {
                    const v = r.kind === "row" ? cellOf(r.line.key, mo) : r.kind === "net" ? netCell(mo) : totalCell(r.grp, mo);
                    const base = { ...styles.tdNum, ...(isSub ? styles.tdSubTotal : {}), ...(mo === ym ? { background: "var(--col-hl)" } : {}), ...cellStyleFor(grpKind === "net" ? "income" : grpKind, v), ...(isSub ? { fontWeight: 600 } : {}) };
                    if (r.kind === "row" && mode === "plan") return <td key={mo} style={base}><button style={{ ...styles.cellBtn, display: "block", width: "100%", textAlign: "right", color: "inherit" }} onClick={() => openEdit(r.line, mo)}>{cellText(v) || " "}</button></td>;
                    return <td key={mo} style={base}>{cellText(v)}</td>;
                  })}
                  {(() => { const t = rowTotal(r); const g = grpKind === "net" ? "income" : grpKind; return <td style={{ ...styles.tdNum, ...styles.tdTotalCell, ...(isSub ? { fontWeight: 700 } : {}), ...cellStyleFor(g, t) }}>{cellText(t)}</td>; })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.miniSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetTitle}>{edit.label}・{edit.mlabel}の計画</div>
            <div style={{ fontSize: 12, color: MUTED, margin: "0 2px 8px" }}>毎月の標準：{num(edit.std)}（空欄で標準を使用）</div>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} placeholder={String(edit.std)} style={styles.amountInput} autoFocus /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={styles.saveBtnHalf} onClick={commitOver}>この月に設定</button>
              <button style={{ ...styles.saveBtnHalf, background: "var(--card-bg)", color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={commitStd}>毎月の標準に</button>
            </div>
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
