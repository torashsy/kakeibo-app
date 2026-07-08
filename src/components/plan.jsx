import React, { useMemo, useState } from "react";
import { INK, MUTED, ACCENT, GREEN, RED } from '../theme.js';
import { num, ymLabel, addMonth, acctRole, planMonths, fyStartOf, planLines, planValue, actualForLine, hasActualForLine, hasBalRecord, balTotalOf, planGroupSign, PLAN_GROUPS, isMonthClosed } from '../utils';
import { styles } from '../styles.js';

// 計画 / 実績 / 見通し / 差異 を月×項目で見るビュー。グループは実績と同じ(給与系/カード/口座/その他)。
// 見通し=実績が入っている行/月は実績、まだの部分は計画。残高は実績を引き継いで先へ projection。
// 締めた月は、記録の有無に関わらず実績を優先(入力もれと「本当に無かった」を区別する)。
export function PlanView({ plans, onSave, config, cards, entries, memos, ym, closedMonths, onToggleClosedMonth }) {
  const [mode, setMode] = useState("forecast"); // forecast | actual | plan | diff
  const [edit, setEdit] = useState(null);
  const [fyOffset, setFyOffset] = useState(0); // 表示中の月とは独立に年度を前後できる

  const fyStart = fyStartOf(ym) + fyOffset;
  const months = useMemo(() => planMonths(fyStart), [fyStart]);
  const lines = useMemo(() => planLines(config, cards), [config, cards]);
  const entriesByMonth = useMemo(() => {
    const m = {}; for (const mo of months) m[mo] = [];
    for (const e of entries) if (m[e.ym]) m[e.ym].push(e);
    return m;
  }, [entries, months]);

  const planOf = (key, mo) => planValue(plans, key, mo);
  const actualOf = (key, mo) => actualForLine(key, entriesByMonth[mo] || [], memos, mo);
  const isActual = (key, mo) => isMonthClosed(closedMonths, mo) || hasActualForLine(key, entriesByMonth[mo] || [], memos, mo);
  const forecastOf = (key, mo) => (isActual(key, mo) ? actualOf(key, mo) : planOf(key, mo));
  const which = mode === "plan" ? "plan" : mode === "actual" ? "actual" : "forecast";
  const valFor = (key, mo, w) => (w === "plan" ? planOf(key, mo) : w === "actual" ? actualOf(key, mo) : forecastOf(key, mo));
  const cellOf = (key, mo) => (mode === "diff" ? actualOf(key, mo) - planOf(key, mo) : valFor(key, mo, which));

  const linesOf = (gid) => lines.filter((l) => l.group === gid);
  const groupSum = (gid, mo, w) => linesOf(gid).reduce((a, l) => a + valFor(l.key, mo, w), 0);
  const subCell = (gid, mo) => (mode === "diff" ? groupSum(gid, mo, "actual") - groupSum(gid, mo, "plan") : groupSum(gid, mo, which));
  // 収支計に含めるグループ(countsTowardNet)だけを合算する。交際費などの「その他」は収支に影響させない。
  const netOf = (mo, w) => PLAN_GROUPS.reduce((a, [gid, , , countsTowardNet]) => a + (countsTowardNet ? planGroupSign(gid) * groupSum(gid, mo, w) : 0), 0);
  const netCell = (mo) => (mode === "diff" ? netOf(mo, "actual") - netOf(mo, "plan") : netOf(mo, which));

  // 残高見通し: 実績残高があればアンカー、無ければ前月+当月の収支
  const balByMonth = useMemo(() => {
    const res = {}; const prevMo = addMonth(months[0], -1);
    let bal = entries.reduce((a, e) => a + (e.ym === prevMo && e.cat === "account" && acctRole(e.item) === "bal" ? e.amount : 0), 0);
    for (const mo of months) {
      const es = entriesByMonth[mo] || [];
      if (hasBalRecord(es)) bal = balTotalOf(es);
      else bal += netOf(mo, mode === "actual" ? "actual" : "forecast");
      res[mo] = { bal, anchored: hasBalRecord(es) };
    }
    return res;
  }, [entries, months, entriesByMonth, plans, mode]);

  const diffColor = (sign, v) => (v === 0 ? MUTED : (v * sign > 0 ? GREEN : RED));
  const cellText = (v) => (v === 0 ? "" : (mode === "diff" && v > 0 ? "+" + num(v) : num(v)));
  const mlabel = (mo) => parseInt(mo.split("-")[1], 10) + "月";
  const showBal = mode === "forecast" || mode === "actual";

  const rows = [];
  PLAN_GROUPS.forEach(([gid, label, sub]) => {
    rows.push({ kind: "head", label });
    linesOf(gid).forEach((l) => rows.push({ kind: "row", line: l, gid }));
    if (sub) rows.push({ kind: "sub", label: sub, gid });
  });
  rows.push({ kind: "net", label: "収支計" });
  if (showBal) rows.push({ kind: "bal", label: "残高見通し" });

  const rowTotal = (r) => {
    if (r.kind === "bal") return null;
    return months.reduce((a, mo) => a + (r.kind === "row" ? cellOf(r.line.key, mo) : r.kind === "net" ? netCell(mo) : subCell(r.gid, mo)), 0);
  };
  const tableWidth = 132 + (months.length + 1) * 96;

  const openEdit = (line, mo) => {
    if (mode !== "plan") return;
    const l = plans && plans.lines && plans.lines[line.key];
    const ov = l && l.over && l.over[mo] != null ? String(l.over[mo]) : "";
    setEdit({ key: line.key, ym: mo, label: line.label, mlabel: ymLabel(mo), std: (l ? Number(l.std) || 0 : 0), value: ov });
  };
  const commitOver = () => {
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    const line = { ...(next.lines[edit.key] || { std: 0, over: {} }) }; line.over = { ...(line.over || {}) };
    if (edit.value === "" || isNaN(Number(edit.value))) delete line.over[edit.ym]; else line.over[edit.ym] = Number(edit.value);
    next.lines[edit.key] = line; onSave(next); setEdit(null);
  };
  const commitStd = () => {
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    const line = { ...(next.lines[edit.key] || { std: 0, over: {} }) };
    line.std = edit.value === "" ? 0 : Number(edit.value) || 0; line.over = { ...(line.over || {}) }; delete line.over[edit.ym];
    next.lines[edit.key] = line; onSave(next); setEdit(null);
  };

  const hint = mode === "forecast" ? "実績が入った分は実績、未入力は計画で表示。灰色=計画（見込み）。残高は実績を引き継いで先へ試算。"
    : mode === "actual" ? "記録から自動集計した実績です。" : mode === "plan" ? "セルをタップで計画を編集（この月／毎月の標準）。" : "実績−計画。緑=良い方向。";

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 10 }}>
        <button aria-label="前の年度" style={styles.monthArrow} onClick={() => setFyOffset((o) => o - 1)}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, minWidth: 88, textAlign: "center" }}>{fyStart}年度</span>
        <button aria-label="次の年度" style={styles.monthArrow} onClick={() => setFyOffset((o) => o + 1)}>›</button>
        {fyOffset !== 0 && <button style={{ ...styles.chipGhost, marginLeft: 4 }} onClick={() => setFyOffset(0)}>今年度に戻す</button>}
      </div>
      {mode === "forecast" && months.includes(ym) && onToggleClosedMonth && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 0 12px", padding: "10px 14px", background: "var(--card-bg)", border: "1px solid var(--line)", borderRadius: 12 }}>
          <span style={{ fontSize: 12.5, color: isMonthClosed(closedMonths, ym) ? ACCENT : MUTED }}>
            {isMonthClosed(closedMonths, ym) ? `✓ ${ymLabel(ym)}は確定済み（未入力の項目は0円として扱います）` : `${ymLabel(ym)}の記録入力は終わりましたか？`}
          </span>
          <button style={{ ...styles.chipGhost, flexShrink: 0 }} onClick={() => onToggleClosedMonth(ym)}>{isMonthClosed(closedMonths, ym) ? "解除" : "確定する"}</button>
        </div>
      )}
      <div style={{ ...styles.viewToggle, display: "flex", flexWrap: "wrap" }}>
        {[["forecast", "見通し"], ["actual", "実績"], ["plan", "計画"], ["diff", "差異"]].map(([v, l]) => (
          <button key={v} style={{ ...styles.viewToggleBtn, ...(mode === v ? styles.viewToggleActive : {}) }} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>{fyStart}年4月〜{fyStart + 1}年3月。{hint}横スクロール可。</div>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, width: tableWidth }}>
          <colgroup><col style={{ width: 132 }} />{months.map((mo) => <col key={"col-" + mo} style={{ width: 96 }} />)}<col style={{ width: 96 }} /></colgroup>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>項目</th>{months.map((mo) => <th key={mo} style={{ ...styles.th, ...(mo === ym ? { color: ACCENT } : {}) }}>{mlabel(mo)}</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>通期</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "head") return <tr key={i}><td colSpan={months.length + 2} style={styles.tdGroup}>{r.label}</td></tr>;
              const isSub = r.kind === "sub" || r.kind === "net";
              const sign = r.kind === "net" ? 1 : r.kind === "row" ? planGroupSign(r.line.group) : planGroupSign(r.gid);
              return (
                <tr key={i}>
                  <td style={{ ...styles.td, ...styles.tdSticky, ...(isSub || r.kind === "bal" ? styles.tdSubLabel : {}) }}>{r.kind === "row" ? r.line.label : r.label}</td>
                  {months.map((mo) => {
                    if (r.kind === "bal") { const b = balByMonth[mo]; return <td key={mo} style={{ ...styles.tdNum, ...styles.tdSubTotal, fontWeight: 600, ...(mo === ym ? { background: "var(--col-hl)" } : {}), color: b.anchored ? INK : MUTED }}>{b.bal ? num(b.bal) : ""}</td>; }
                    const v = r.kind === "row" ? cellOf(r.line.key, mo) : r.kind === "net" ? netCell(mo) : subCell(r.gid, mo);
                    const projected = mode === "forecast" && r.kind === "row" && !isActual(r.line.key, mo);
                    let color;
                    if (mode === "diff") color = diffColor(sign, v);
                    else if (r.kind === "net") color = v === 0 ? undefined : v > 0 ? GREEN : RED;
                    else if (projected) color = MUTED;
                    const base = { ...styles.tdNum, ...(isSub ? { ...styles.tdSubTotal, fontWeight: 600 } : {}), ...(mo === ym ? { background: "var(--col-hl)" } : {}), ...(color ? { color } : {}) };
                    if (r.kind === "row" && mode === "plan") return <td key={mo} style={base}><button style={{ ...styles.cellBtn, display: "block", width: "100%", textAlign: "right", color: "inherit" }} onClick={() => openEdit(r.line, mo)}>{cellText(v) || " "}</button></td>;
                    return <td key={mo} style={base}>{cellText(v)}</td>;
                  })}
                  {(() => { const t = rowTotal(r); if (t == null) return <td style={{ ...styles.tdNum, ...styles.tdTotalCell }}></td>; const c = mode === "diff" ? diffColor(sign, t) : r.kind === "net" ? (t === 0 ? undefined : t > 0 ? GREEN : RED) : undefined; return <td style={{ ...styles.tdNum, ...styles.tdTotalCell, ...(isSub ? { fontWeight: 700 } : {}), ...(c ? { color: c } : {}) }}>{cellText(t)}</td>; })()}
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
