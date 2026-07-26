import React, { useMemo, useState } from "react";
import { INK, MUTED, ACCENT, GREEN, RED } from '../theme.js';
import {
  num, ymLabel, addMonth, planMonths, fyStartOf, computeSummary, planValue, evalAmount,
  plannedIncome, plannedSalaryIncome, plannedOtherIncome, plannedVariable, plannedInvest, plannedSpending, plannedNet, fixedForMonth, variableBuckets,
  plannedDebt, estimateSalaryTakeHome, plannedSalaryBreakdown,
  hasBalRecord, balTotalOf, monthHasInput, isMonthClosed,
  PLAN_OTHER_INCOME, PLAN_VARIABLE, PLAN_INVEST,
} from '../utils';
import { styles } from '../styles.js';
import { AmountField } from './amount.jsx';

// 簡素化した計画ビュー。計画は「収入」「変動費」「投資振替」の3本だけを持ち、
// 支出見込み総額 = 固定費(定期費から自動) + 変動費。年度(4月開始)の月×項目で見る。
//  - 見通し: 入力が始まった/締めた月は実績、それ以外は計画。残高は実績を引き継いで先へ試算。
//  - 計画: セルをタップして収入・変動費・投資を編集(この月/毎月の標準)。固定費は定期費から自動表示。
//  - 差異: 実績−計画。
export function PlanView({ plans, onSave, subs, cards, debt, entries, config, ym, closedMonths, onToggleClosedMonth, onOpenRecurring }) {
  const [mode, setMode] = useState("forecast"); // forecast | plan | diff
  const [edit, setEdit] = useState(null);
  const [salaryEdit, setSalaryEdit] = useState(null);
  const [salaryExpanded, setSalaryExpanded] = useState(false);
  const [newBucket, setNewBucket] = useState(null);
  const [fyOffset, setFyOffset] = useState(0);

  const fyStart = fyStartOf(ym) + fyOffset;
  const months = useMemo(() => planMonths(fyStart), [fyStart]);
  const entriesByMonth = useMemo(() => {
    const m = {}; for (const mo of months) m[mo] = [];
    for (const e of entries) if (m[e.ym]) m[e.ym].push(e);
    return m;
  }, [entries, months]);
  const actualOf = (k, mo) => {
    const s = computeSummary(entriesByMonth[mo] || []);
    if (k.startsWith("salaryItem|")) {
      const item = k.slice(11);
      return (entriesByMonth[mo] || []).reduce((sum, e) => sum + (e.cat === "salary" && e.item === item ? Number(e.amount) || 0 : 0), 0);
    }
    return k === "salaryIncome" ? s.salaryIncome : k === "otherIncome" ? s.otherIncome : k === "income" ? s.income : k === "spending" ? s.expense : k === "invest" ? s.invest : k === "net" ? s.net : 0;
  };
  const planOf = (k, mo) => (
    k.startsWith("salaryItem|") ? (plannedSalaryBreakdown(plans, mo)[k.slice(11)] || 0)
      : k.startsWith("var|") ? planValue(plans, k, mo)
      : k === "salaryIncome" ? plannedSalaryIncome(plans, mo)
        : k === "otherIncome" ? plannedOtherIncome(plans, mo)
          : k === "income" ? plannedIncome(plans, mo)
        : k === "spending" ? plannedSpending(plans, subs, mo, debt, cards)
          : k === "variable" ? plannedVariable(plans, mo)
            : k === "fixed" ? fixedForMonth(subs, mo, cards)
              : k === "debt" ? plannedDebt(debt, mo)
                : k === "invest" ? plannedInvest(plans, mo)
                  : k === "net" ? plannedNet(plans, subs, mo, debt, cards) : 0
  );
  const isActualMonth = (mo) => isMonthClosed(closedMonths, mo) || (entriesByMonth[mo] || []).length > 0;
  const forecastOf = (k, mo) => (isActualMonth(mo) ? actualOf(k, mo) : planOf(k, mo));
  // 差異は実績が入力済み（または記録なしで確定済み）の月だけ表示する。
  const cellOf = (k, mo) => (mode === "diff" ? (isActualMonth(mo) ? actualOf(k, mo) - planOf(k, mo) : 0) : mode === "plan" ? planOf(k, mo) : forecastOf(k, mo));

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
  }, [entries, months, entriesByMonth, plans, subs, cards, debt, mode]);

  const diffColor = (k, v) => (v === 0 ? MUTED : k === "spending" ? (v > 0 ? RED : GREEN) : k === "invest" ? MUTED : (v > 0 ? GREEN : RED));
  const cellText = (v) => (v === 0 ? "" : (mode === "diff" && v > 0 ? "+" + num(v) : num(v)));
  const mlabel = (mo) => parseInt(mo.split("-")[1], 10) + "月";

  const buckets = variableBuckets(plans);
  const variableRows = buckets.length
    ? [...buckets.map((name) => ({ k: "var|" + name, label: "・" + name, editable: "var|" + name })), { k: "variable", label: "変動費計", sub: true }]
    : [{ k: "variable", label: "変動費", editable: PLAN_VARIABLE }];
  const salaryItems = (config && config.salaryItems && config.salaryItems.length) ? config.salaryItems : ["給与", "手当", "交通費手当", "賞与", "控除"];
  const salaryDetailRows = salaryExpanded ? salaryItems.map((item) => ({ k: "salaryItem|" + item, label: "・" + item, salaryDetail: true })) : [];
  const rows = mode === "plan"
    ? [
      { k: "salaryIncome", label: "給与", salary: true, expandable: true },
      ...salaryDetailRows,
      { k: "otherIncome", label: "その他", editable: PLAN_OTHER_INCOME },
      { k: "income", label: "収入計", sub: true },
      { k: "fixed", label: "固定費", muted: true, destination: "subs" },
      ...variableRows,
      { k: "debt", label: "残債", muted: true, destination: "debt" },
      { k: "spending", label: "支出計", sub: true },
      { k: "invest", label: "投資振替", editable: PLAN_INVEST },
      { k: "net", label: "収支", net: true },
    ]
    : [
      { k: "salaryIncome", label: "給与", expandable: true },
      ...salaryDetailRows,
      { k: "otherIncome", label: "その他" },
      { k: "income", label: "収入計", sub: true },
      { k: "spending", label: "支出" },
      { k: "invest", label: "投資振替" },
      { k: "net", label: "収支", net: true },
    ];

  const rowTotal = (r) => months.reduce((a, mo) => a + cellOf(r.k, mo), 0);
  const tableWidth = 112 + (months.length + 1) * 92;
  const showBal = mode === "forecast";

  const openEdit = (r, mo) => {
    if (r.salary || r.salaryDetail) { openSalary(); return; }
    if (r.destination) { onOpenRecurring && onOpenRecurring(r.destination); return; }
    if (mode !== "plan" || !r.editable) return;
    const l = plans && plans.lines && plans.lines[r.editable];
    const ov = l && l.over && l.over[mo] != null ? String(l.over[mo]) : "";
    setEdit({ key: r.editable, ym: mo, label: r.label, mlabel: ymLabel(mo), std: (l ? Number(l.std) || 0 : 0), value: ov });
  };

  const openSalary = () => {
    const cycles = (plans.salary && plans.salary.cycles) || {};
    const bonuses = (plans.salary && plans.salary.bonuses) || {};
    const rule = (plans.salary && plans.salary.rules && plans.salary.rules[String(fyStart)]) || {};
    const prev = cycles[String(fyStart - 1)] || {};
    const current = cycles[String(fyStart)] || {};
    setSalaryEdit({
      aGross: prev.gross ? String(prev.gross) : "",
      bGross: current.gross ? String(current.gross) : "",
      standard: current.standardMonthly ? String(current.standardMonthly) : (prev.standardMonthly ? String(prev.standardMonthly) : ""),
      x: rule.juneMultiplier != null ? String(rule.juneMultiplier) : (bonuses[`${fyStart}-06`] && prev.gross ? String(Number(bonuses[`${fyStart}-06`]) / Number(prev.gross)) : ""),
      y: rule.decemberMultiplier != null ? String(rule.decemberMultiplier) : (bonuses[`${fyStart}-12`] && current.gross ? String(Number(bonuses[`${fyStart}-12`]) / Number(current.gross)) : ""),
      transport: rule.transportAllowance ? String(rule.transportAllowance) : "",
    });
  };

  const commitSalary = () => {
    const next = { ...plans, salary: { cycles: { ...((plans.salary && plans.salary.cycles) || {}) }, bonuses: { ...((plans.salary && plans.salary.bonuses) || {}) }, rules: { ...((plans.salary && plans.salary.rules) || {}) } } };
    const amount = (value) => Math.max(0, Math.round(evalAmount(value) || 0));
    const standardMonthly = amount(salaryEdit.standard);
    if (!standardMonthly) return;
    const saveCycle = (key, grossValue) => {
      const gross = amount(grossValue);
      if (gross) next.salary.cycles[key] = { gross, standardMonthly };
      else delete next.salary.cycles[key];
    };
    saveCycle(String(fyStart - 1), salaryEdit.aGross);
    saveCycle(String(fyStart), salaryEdit.bGross);
    next.salary.rules[String(fyStart)] = {
      juneMultiplier: Math.max(0, Number(salaryEdit.x) || 0),
      decemberMultiplier: Math.max(0, Number(salaryEdit.y) || 0),
      transportAllowance: amount(salaryEdit.transport),
    };
    for (const month of [`${fyStart}-06`, `${fyStart}-07`, `${fyStart}-12`]) delete next.salary.bonuses[month];
    onSave(next); setSalaryEdit(null);
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
  const addBucket = () => setNewBucket({
    name: "",
    // 旧形式の変動費総額が残っている場合は、最初の項目へ引き継ぐ。
    amount: buckets.length === 0 && plans.lines && plans.lines.variable && plans.lines.variable.std
      ? String(plans.lines.variable.std) : "",
  });
  const commitBucket = () => {
    const name = (newBucket.name || "").trim();
    if (!name || name.includes("|")) return;
    const key = "var|" + name;
    if (plans.lines && plans.lines[key]) return;
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    next.lines[key] = { std: Math.max(0, Math.round(evalAmount(newBucket.amount) || 0)), over: {} };
    onSave(next);
    setNewBucket(null);
  };
  const deleteBucket = (name) => {
    if (!window.confirm(`変動費の枠「${name}」を削除しますか？`)) return;
    const next = { ...plans, lines: { ...(plans.lines || {}) } };
    delete next.lines["var|" + name];
    onSave(next);
  };

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
      {mode === "plan" && <button style={{ ...styles.backupBtn, margin: "0 0 10px" }} onClick={openSalary}>給与</button>}
      {mode === "forecast" && (
        <div style={{ ...styles.balCard, marginBottom: 10 }}>
          <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED }}>年度末</span><span style={{ ...styles.balVal, fontSize: 20 }}>{num(balByMonth[months[months.length - 1]].bal)}</span></div>
        </div>
      )}
      {/* 入力ゼロの月だけ「記録なしで確定」バーを出す(締めると見通しで実績0扱いになる) */}
      {mode === "forecast" && months.includes(ym) && onToggleClosedMonth && !monthHasInput(entriesByMonth[ym] || [], [], ym) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 4px 6px" }}>
          <span style={{ fontSize: 11.5, color: isMonthClosed(closedMonths, ym) ? ACCENT : MUTED }}>
            {isMonthClosed(closedMonths, ym) ? `✓ ${ymLabel(ym)} 確定済み` : `${ymLabel(ym)} 記録なし`}
          </span>
          <button style={{ ...styles.chipGhost, flexShrink: 0 }} onClick={() => onToggleClosedMonth(ym)}>{isMonthClosed(closedMonths, ym) ? "解除" : "確定"}</button>
        </div>
      )}
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, width: tableWidth }}>
          <colgroup><col style={{ width: 112 }} />{months.map((mo) => <col key={"col-" + mo} style={{ width: 92 }} />)}<col style={{ width: 92 }} /></colgroup>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>項目</th>{months.map((mo) => <th key={mo} style={{ ...styles.th, ...(mo === ym ? { color: ACCENT } : {}) }}>{mlabel(mo)}</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>通期</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const isSub = !!(r.sub || r.net);
              return (
                <tr key={r.k}>
                  <td style={{ ...styles.td, ...styles.tdSticky, ...(isSub ? styles.tdSubLabel : {}), ...(r.salaryDetail ? { color: MUTED, fontWeight: 400 } : {}), ...(r.muted ? { color: MUTED } : {}) }}>
                    {r.expandable
                      ? <button aria-expanded={salaryExpanded} style={{ ...styles.cellBtn, width: "100%", textAlign: "left", fontWeight: 600 }} onClick={() => setSalaryExpanded((v) => !v)}>{salaryExpanded ? "⌄" : "›"} {r.label}</button>
                      : (r.editable || r.salaryDetail || r.destination)
                        ? <button style={{ ...styles.cellBtn, width: "100%", textAlign: "left", color: "inherit", fontWeight: "inherit" }} onClick={() => openEdit(r, months.includes(ym) ? ym : months[0])}>{r.label}</button>
                        : r.label}
                  </td>
                  {months.map((mo) => {
                    const v = cellOf(r.k, mo);
                    const projected = mode === "forecast" && !isActualMonth(mo);
                    let color;
                    if (mode === "diff") color = diffColor(r.k, v);
                    else if (r.net) color = v === 0 ? undefined : v > 0 ? GREEN : RED;
                    else if (r.muted || projected) color = MUTED;
                    const base = { ...styles.tdNum, textAlign: "right", ...(isSub ? { ...styles.tdSubTotal, fontWeight: 600 } : {}), ...(mo === ym ? { background: "var(--col-hl)" } : {}), ...(color ? { color } : {}) };
                    const canOpen = r.salary || r.salaryDetail || r.destination || (r.editable && mode === "plan");
                    if (canOpen) return <td key={mo} style={base}><button aria-label={`${r.label}・${ymLabel(mo)}`} style={{ ...styles.cellBtn, display: "block", width: "100%", minHeight: 20, textAlign: "right", color: "inherit" }} onClick={() => openEdit(r, mo)}>{cellText(v) || " "}</button></td>;
                    return <td key={mo} style={base}>{cellText(v)}</td>;
                  })}
                  {(() => { const t = rowTotal(r); const c = mode === "diff" ? diffColor(r.k, t) : r.net ? (t === 0 ? undefined : t > 0 ? GREEN : RED) : undefined; return <td style={{ ...styles.tdNum, ...styles.tdTotalCell, textAlign: "right", ...(isSub ? { fontWeight: 700 } : {}), ...(c ? { color: c } : (r.muted ? { color: MUTED } : {})) }}>{cellText(t)}</td>; })()}
                </tr>
              );
            })}
            {showBal && (
              <tr>
                <td style={{ ...styles.td, ...styles.tdSticky, ...styles.tdSubLabel }}>残高見通し</td>
                {months.map((mo) => { const b = balByMonth[mo]; return <td key={mo} style={{ ...styles.tdNum, ...styles.tdSubTotal, textAlign: "right", fontWeight: 600, ...(mo === ym ? { background: "var(--col-hl)" } : {}), color: b.anchored ? INK : MUTED }}>{b.bal ? num(b.bal) : ""}</td>; })}
                <td style={{ ...styles.tdNum, ...styles.tdTotalCell }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode === "plan" && (
        <div style={{ margin: "12px 4px 0" }}>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>変動費内訳</div>
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
            <div style={{ fontSize: 12, color: MUTED, margin: "0 2px 8px" }}>標準 {num(edit.std)}</div>
            <AmountField value={edit.value} onChange={(v) => setEdit({ ...edit, value: v })} placeholder={String(edit.std)} autoFocus />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={styles.saveBtnHalf} onClick={commitOver}>この月に設定</button>
              <button style={{ ...styles.saveBtnHalf, background: "var(--card-bg)", color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={commitStd}>毎月の標準に</button>
            </div>
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
      {newBucket && (
        <div style={styles.sheetBackdrop} onClick={() => setNewBucket(null)}>
          <div style={styles.miniSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetTitle}>項目を追加</div>
            <input value={newBucket.name} onChange={(e) => setNewBucket({ ...newBucket, name: e.target.value })} placeholder="項目名" style={styles.textInput} autoFocus />
            <div style={{ marginTop: 8 }}><AmountField value={newBucket.amount} onChange={(v) => setNewBucket({ ...newBucket, amount: v })} placeholder="毎月の金額" /></div>
            <button style={{ ...styles.saveBtn, ...(!newBucket.name.trim() ? { opacity: 0.45 } : {}) }} disabled={!newBucket.name.trim()} onClick={commitBucket}>追加</button>
            <button style={styles.cancelBtn} onClick={() => setNewBucket(null)}>閉じる</button>
          </div>
        </div>
      )}
      {salaryEdit && (
        <div style={styles.sheetBackdrop} onClick={() => setSalaryEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>給与</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ fontSize: 12, color: MUTED }}><span>A額面（4〜6月）</span><AmountField value={salaryEdit.aGross} onChange={(v) => setSalaryEdit({ ...salaryEdit, aGross: v })} placeholder="0" /></label>
              <label style={{ fontSize: 12, color: MUTED }}><span>B額面（7〜3月）</span><AmountField value={salaryEdit.bGross} onChange={(v) => setSalaryEdit({ ...salaryEdit, bGross: v })} placeholder="0" /></label>
              <label style={{ fontSize: 12, color: MUTED, gridColumn: "1 / -1" }}><span>標準報酬月額</span><AmountField value={salaryEdit.standard} onChange={(v) => setSalaryEdit({ ...salaryEdit, standard: v })} placeholder="0" /></label>
              <label style={{ fontSize: 12, color: MUTED }}><span>6月（xか月）</span><input type="number" inputMode="decimal" step="0.1" value={salaryEdit.x} onChange={(e) => setSalaryEdit({ ...salaryEdit, x: e.target.value })} placeholder="0" style={{ ...styles.textInput, margin: 0, textAlign: "right" }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}><span>12月（yか月）</span><input type="number" inputMode="decimal" step="0.1" value={salaryEdit.y} onChange={(e) => setSalaryEdit({ ...salaryEdit, y: e.target.value })} placeholder="0" style={{ ...styles.textInput, margin: 0, textAlign: "right" }} /></label>
              <label style={{ fontSize: 12, color: MUTED, gridColumn: "1 / -1" }}><span>交通費手当（4・10月）</span><AmountField value={salaryEdit.transport} onChange={(v) => setSalaryEdit({ ...salaryEdit, transport: v })} placeholder="0" /></label>
            </div>
            <SalaryRulePreview edit={salaryEdit} />
            <button style={{ ...styles.saveBtn, ...(!evalAmount(salaryEdit.standard) ? { opacity: 0.45 } : {}) }} disabled={!evalAmount(salaryEdit.standard)} onClick={commitSalary}>保存</button>
            <button style={styles.cancelBtn} onClick={() => setSalaryEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SalaryRulePreview({ edit }) {
  const a = Math.max(0, evalAmount(edit.aGross) || 0);
  const b = Math.max(0, evalAmount(edit.bGross) || 0);
  const standard = Math.max(0, evalAmount(edit.standard) || 0);
  const june = a * Math.max(0, Number(edit.x) || 0);
  const july = Math.max(0, b - a) * 3;
  const december = b * Math.max(0, Number(edit.y) || 0);
  const transport = Math.max(0, evalAmount(edit.transport) || 0);
  const aNet = standard ? estimateSalaryTakeHome(a, standard).takeHome : 0;
  const bNet = standard ? estimateSalaryTakeHome(b, standard).takeHome : 0;
  return (
    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8, marginTop: 10 }}>
      <div>手取り　A {num(aNet)} ／ B {num(bNet)}</div>
      <div>賞与等　6月 {num(june)} ／ 7月 {num(july)} ／ 12月 {num(december)}</div>
      <div>交通費　4月・10月 {num(transport)}</div>
    </div>
  );
}
