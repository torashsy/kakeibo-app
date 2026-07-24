import React, { useMemo, useState } from "react";
import { INK, MUTED, ACCENT, GREEN, RED } from '../theme.js';
import {
  num, ymLabel, addMonth, planMonths, fyStartOf, computeSummary, planValue, evalAmount,
  plannedIncome, plannedVariable, plannedInvest, plannedSpending, plannedNet, fixedMonthly, variableBuckets,
  hasBalRecord, balTotalOf, monthHasInput, isMonthClosed,
  PLAN_INCOME, PLAN_VARIABLE, PLAN_INVEST,
} from '../utils';
import { styles } from '../styles.js';
import { AmountField } from './amount.jsx';

// 簡素化した計画ビュー。計画は「収入」「変動費」「投資振替」の3本だけを持ち、
// 支出見込み総額 = 固定費(定期費から自動) + 変動費。年度(4月開始)の月×項目で見る。
//  - 見通し: 入力が始まった/締めた月は実績、それ以外は計画。残高は実績を引き継いで先へ試算。
//  - 計画: セルをタップして収入・変動費・投資を編集(この月/毎月の標準)。固定費は定期費から自動表示。
//  - 差異: 実績−計画。
export function PlanView({ plans, onSave, subs, entries, ym, closedMonths, onToggleClosedMonth }) {
  const [mode, setMode] = useState("forecast"); // forecast | plan | diff
  const [edit, setEdit] = useState(null);
  const [fyOffset, setFyOffset] = useState(0);

  const fyStart = fyStartOf(ym) + fyOffset;
  const months = useMemo(() => planMonths(fyStart), [fyStart]);
  const entriesByMonth = useMemo(() => {
    const m = {}; for (const mo of months) m[mo] = [];
    for (const e of entries) if (m[e.ym]) m[e.ym].push(e);
    return m;
  }, [entries, months]);
  const fixed = useMemo(() => fixedMonthly(subs), [subs]);

  const actualOf = (k, mo) => {
    const s = computeSummary(entriesByMonth[mo] || []);
    return k === "income" ? s.income : k === "spending" ? s.expense : k === "invest" ? s.invest : k === "net" ? s.net : 0;
  };
  const planOf = (k, mo) => (
    k.startsWith("var|") ? planValue(plans, k, mo)
      : k === "income" ? plannedIncome(plans, mo)
        : k === "spending" ? plannedSpending(plans, subs, mo)
          : k === "variable" ? plannedVariable(plans, mo)
            : k === "fixed" ? fixed
              : k === "invest" ? plannedInvest(plans, mo)
                : k === "net" ? plannedNet(plans, subs, mo) : 0
  );
  const isActualMonth = (mo) => isMonthClosed(closedMonths, mo) || (entriesByMonth[mo] || []).length > 0;
  const forecastOf = (k, mo) => (isActualMonth(mo) ? actualOf(k, mo) : planOf(k, mo));
  const cellOf = (k, mo) => (mode === "diff" ? actualOf(k, mo) - planOf(k, mo) : mode === "plan" ? planOf(k, mo) : forecastOf(k, mo));

  // 残高見通し: 実績残高があればアンカー、無ければ前月+当月の収支(見通し)
  const balByMonth = useMemo(() => {
    const res = {}; const prevMo = addMonth(months[0], -1);
    let bal = entries.reduce((a, e) => a + (e.ym === prevMo && e.cat === "account" && e.item === "残高" ? e.amount : 0), 0);
    for (const mo of months) {
      const es = entriesByMonth[mo] || [];
      if (hasBalRecord(es)) bal = balTotalOf(es);
      else bal += forecastOf("net", mo);
      res[mo] = { bal, anchored: hasBalRecord(es) };
    }
    return res;
  }, [entries, months, entriesByMonth, plans, subs, mode]);

  const diffColor = (k, v) => (v === 0 ? MUTED : k === "spending" ? (v > 0 ? RED : GREEN) : k === "invest" ? MUTED : (v > 0 ? GREEN : RED));
  const cellText = (v) => (v === 0 ? "" : (mode === "diff" && v > 0 ? "+" + num(v) : num(v)));
  const mlabel = (mo) => parseInt(mo.split("-")[1], 10) + "月";

  const buckets = variableBuckets(plans);
  const variableRows = buckets.length
    ? [...buckets.map((name) => ({ k: "var|" + name, label: "・" + name, editable: "var|" + name })), { k: "variable", label: "変動費計", sub: true }]
    : [{ k: "variable", label: "変動費", editable: PLAN_VARIABLE }];
  const rows = mode === "plan"
    ? [
      { k: "income", label: "収入", editable: PLAN_INCOME },
      { k: "fixed", label: "固定費", muted: true },
      ...variableRows,
      { k: "spending", label: "支出計", sub: true },
      { k: "invest", label: "投資振替", editable: PLAN_INVEST },
      { k: "net", label: "収支", net: true },
    ]
    : [
      { k: "income", label: "収入" },
      { k: "spending", label: "支出" },
      { k: "invest", label: "投資振替" },
      { k: "net", label: "収支", net: true },
    ];

  const rowTotal = (r) => months.reduce((a, mo) => a + cellOf(r.k, mo), 0);
  const tableWidth = 112 + (months.length + 1) * 92;
  const showBal = mode === "forecast";

  const openEdit = (r, mo) => {
    if (mode !== "plan" || !r.editable) return;
    const l = plans && plans.lines && plans.lines[r.editable];
    const ov = l && l.over && l.over[mo] != null ? String(l.over[mo]) : "";
    setEdit({ key: r.editable, ym: mo, label: r.label, mlabel: ymLabel(mo), std: (l ? Number(l.std) || 0 : 0), value: ov });
  };
  const commitOver = () => {
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    const line = { ...(next.lines[edit.key] || { std: 0, over: {} }) }; line.over = { ...(line.over || {}) };
    const v = evalAmount(edit.value);
    if (v == null) delete line.over[edit.ym]; else line.over[edit.ym] = Math.round(v);
    next.lines[edit.key] = line; onSave(next); setEdit(null);
  };
  const commitStd = () => {
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    const line = { ...(next.lines[edit.key] || { std: 0, over: {} }) };
    line.std = Math.round(evalAmount(edit.value) ?? 0); line.over = { ...(line.over || {}) }; delete line.over[edit.ym];
    next.lines[edit.key] = line; onSave(next); setEdit(null);
  };

  // 変動費の予算枠(旅費・交際費など)を追加/削除する。枠を作ると変動費を内訳で管理できる。
  const addBucket = () => {
    const name = (window.prompt("変動費の枠の名前（例：旅費／交際費／交通費）") || "").trim();
    if (!name || name.includes("|")) return;
    const key = "var|" + name;
    if (plans.lines && plans.lines[key]) return;
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    // 最初の枠は既存の単一「変動費」の標準額を引き継いで、支出総額が急に変わらないようにする
    const seedStd = buckets.length === 0 ? (Number(plans.lines && plans.lines.variable && plans.lines.variable.std) || 0) : 0;
    next.lines[key] = { std: seedStd, over: {} };
    onSave(next);
  };
  const deleteBucket = (name) => {
    if (!window.confirm(`変動費の枠「${name}」を削除しますか？`)) return;
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    delete next.lines["var|" + name];
    onSave(next);
  };

  const hint = mode === "forecast" ? "入力が始まった月は実績、未入力の月は計画で表示。灰色=計画（見込み）。残高は実績を引き継いで先へ試算。"
    : mode === "plan" ? "セルをタップで計画を編集（この月／毎月の標準）。固定費は定期費から自動集計。支出計＝固定費＋変動費。"
      : "実績−計画。支出は赤=使いすぎ、収支は緑=良い方向。";

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 10 }}>
        <button aria-label="前の年度" style={styles.monthArrow} onClick={() => setFyOffset((o) => o - 1)}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, minWidth: 88, textAlign: "center" }}>{fyStart}年度</span>
        <button aria-label="次の年度" style={styles.monthArrow} onClick={() => setFyOffset((o) => o + 1)}>›</button>
        {fyOffset !== 0 && <button style={{ ...styles.chipGhost, marginLeft: 4 }} onClick={() => setFyOffset(0)}>今年度に戻す</button>}
      </div>
      <div style={{ ...styles.viewToggle, display: "flex", flexWrap: "wrap" }}>
        {[["forecast", "見通し"], ["plan", "計画"], ["diff", "差異"]].map(([v, l]) => (
          <button key={v} style={{ ...styles.viewToggleBtn, ...(mode === v ? styles.viewToggleActive : {}) }} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>
      {/* 入力ゼロの月だけ「記録なしで確定」バーを出す(締めると見通しで実績0扱いになる) */}
      {mode === "forecast" && months.includes(ym) && onToggleClosedMonth && !monthHasInput(entriesByMonth[ym] || [], [], ym) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 4px 6px" }}>
          <span style={{ fontSize: 11.5, color: isMonthClosed(closedMonths, ym) ? ACCENT : MUTED }}>
            {isMonthClosed(closedMonths, ym) ? `✓ ${ymLabel(ym)}は記録なしで確定済み` : `${ymLabel(ym)}は記録がありません。記録なしで確定しますか？`}
          </span>
          <button style={{ ...styles.chipGhost, flexShrink: 0 }} onClick={() => onToggleClosedMonth(ym)}>{isMonthClosed(closedMonths, ym) ? "解除" : "確定する"}</button>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>{hint}横スクロール可。</div>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, width: tableWidth }}>
          <colgroup><col style={{ width: 112 }} />{months.map((mo) => <col key={"col-" + mo} style={{ width: 92 }} />)}<col style={{ width: 92 }} /></colgroup>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>項目</th>{months.map((mo) => <th key={mo} style={{ ...styles.th, ...(mo === ym ? { color: ACCENT } : {}) }}>{mlabel(mo)}</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>通期</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const isSub = !!(r.sub || r.net);
              return (
                <tr key={r.k}>
                  <td style={{ ...styles.td, ...styles.tdSticky, ...(isSub ? styles.tdSubLabel : {}), ...(r.muted ? { color: MUTED } : {}) }}>{r.label}</td>
                  {months.map((mo) => {
                    const v = cellOf(r.k, mo);
                    const projected = mode === "forecast" && !isActualMonth(mo);
                    let color;
                    if (mode === "diff") color = diffColor(r.k, v);
                    else if (r.net) color = v === 0 ? undefined : v > 0 ? GREEN : RED;
                    else if (r.muted || projected) color = MUTED;
                    const base = { ...styles.tdNum, ...(isSub ? { ...styles.tdSubTotal, fontWeight: 600 } : {}), ...(mo === ym ? { background: "var(--col-hl)" } : {}), ...(color ? { color } : {}) };
                    if (r.editable && mode === "plan") return <td key={mo} style={base}><button style={{ ...styles.cellBtn, display: "block", width: "100%", textAlign: "right", color: "inherit" }} onClick={() => openEdit(r, mo)}>{cellText(v) || " "}</button></td>;
                    return <td key={mo} style={base}>{cellText(v)}</td>;
                  })}
                  {(() => { const t = rowTotal(r); const c = mode === "diff" ? diffColor(r.k, t) : r.net ? (t === 0 ? undefined : t > 0 ? GREEN : RED) : undefined; return <td style={{ ...styles.tdNum, ...styles.tdTotalCell, ...(isSub ? { fontWeight: 700 } : {}), ...(c ? { color: c } : (r.muted ? { color: MUTED } : {})) }}>{cellText(t)}</td>; })()}
                </tr>
              );
            })}
            {showBal && (
              <tr>
                <td style={{ ...styles.td, ...styles.tdSticky, ...styles.tdSubLabel }}>残高見通し</td>
                {months.map((mo) => { const b = balByMonth[mo]; return <td key={mo} style={{ ...styles.tdNum, ...styles.tdSubTotal, fontWeight: 600, ...(mo === ym ? { background: "var(--col-hl)" } : {}), color: b.anchored ? INK : MUTED }}>{b.bal ? num(b.bal) : ""}</td>; })}
                <td style={{ ...styles.tdNum, ...styles.tdTotalCell }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode === "plan" && (
        <div style={{ margin: "12px 4px 0" }}>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>変動費の枠（旅費・交際費など。任意。枠を作ると変動費を内訳で見積もれます）</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {buckets.map((name) => (
              <button key={name} style={styles.optionChip} onClick={() => deleteBucket(name)}>{name} ×</button>
            ))}
            <button style={{ ...styles.optionChip, ...styles.optionChipActive }} onClick={addBucket}>＋ 枠を追加</button>
          </div>
        </div>
      )}

      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.miniSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetTitle}>{edit.label}・{edit.mlabel}の計画</div>
            <div style={{ fontSize: 12, color: MUTED, margin: "0 2px 8px" }}>毎月の標準：{num(edit.std)}（空欄で標準を使用）</div>
            <AmountField value={edit.value} onChange={(v) => setEdit({ ...edit, value: v })} placeholder={String(edit.std)} autoFocus />
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
