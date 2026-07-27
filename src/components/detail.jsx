import React, { useMemo, useState } from "react";
import { ACCENT, INK, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, num, buildStructure, computeSummary, flowTypesFor, acctRole, parseTxnKey, entryDate } from '../utils';
import { styles } from '../styles.js';
import { MemoList } from './memos.jsx';
import { AnnualMatrix } from './annual-matrix.jsx';

// 記録タブ。その月に入力した実績(給与・カード・口座)を、履歴/項目別/表/年間で見返す。
// 「メモ」は収支に計上しない用途記録(現金の使い道など)。計画は独立した「計画」タブへ分離した。
export function Detail({ monthEntries, entries, ym, config, cards, memos, onSaveMemos, onEdit }) {
  const [view, setView] = useState("card");
  const S = useMemo(() => buildStructure(monthEntries, config, cards), [monthEntries, config, cards]);
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={{ ...styles.viewToggle, display: "flex", flexWrap: "wrap" }}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "list" ? styles.viewToggleActive : {}) }} onClick={() => setView("list")}>履歴</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "card" ? styles.viewToggleActive : {}) }} onClick={() => setView("card")}>月別</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "year" ? styles.viewToggleActive : {}) }} onClick={() => setView("year")}>年間</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "memo" ? styles.viewToggleActive : {}) }} onClick={() => setView("memo")}>メモ</button>
      </div>
      {view === "list" && <DetailList monthEntries={monthEntries} onEdit={onEdit} />}
      {view === "card" && <DetailCards S={S} config={config} cards={cards} onEdit={onEdit} />}
      {view === "year" && <YearTable entries={entries} ym={ym} config={config} cards={cards} />}
      {view === "memo" && <MemoList memos={memos} onSave={onSaveMemos} cards={cards} config={config} ym={ym} />}
    </div>
  );
}

export function DetailList({ monthEntries, onEdit }) {
  const catLabel = { salary: "給与系", card: "カード", account: "口座" };
  const catColor = { salary: GREEN, card: RED, account: ACCENT };
  // 取り込んだ記録は指紋(src)に取引日を持っているので、日付の新しい順に並べる。
  // 日付を持たない記録(手入力)は日付順に混ぜられないので、末尾に入力の新しい順で置く。
  const list = useMemo(() => monthEntries
    .map((e, i) => ({ e, i, d: entryDate(e), desc: parseTxnKey(e.src)?.desc }))
    .sort((a, b) => {
      if (a.d && b.d) return a.d === b.d ? b.i - a.i : (a.d < b.d ? 1 : -1);
      if (a.d) return -1;   // 日付のある記録を先に
      if (b.d) return 1;
      return b.i - a.i;
    }), [monthEntries]);
  if (!list.length) return <div style={{ color: MUTED, fontSize: 13, padding: 12 }}>記録なし</div>;
  return (
    <div>
      <div style={styles.detailCard}>
        {list.map(({ e, d, desc }) => (
          <button key={e.id} style={styles.listRow} onClick={() => onEdit(e)}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, overflow: "hidden" }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{e.cat === "account" ? `${e.item}・${e.account}` : e.item}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ ...styles.catTag, color: catColor[e.cat] }}>{catLabel[e.cat]}</span>
                <span style={{ fontSize: 11, color: MUTED }}>{d || "日付なし"}</span>
              </span>
              {desc && <span style={{ fontSize: 11, color: MUTED, wordBreak: "break-all", textAlign: "left" }}>{desc}</span>}
            </span>
            <span style={styles.editRowRight}>
              <span
                style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: e.amount < 0 ? RED : INK }}>{yen(e.amount)}</span>
              <span style={styles.chev}>›</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ItemRow({ label, node, gkey, open, toggle, onEdit }) {
  const its = node.entries; const total = its.reduce((a, e) => a + e.amount, 0);
  if (its.length === 0) {
    return <div style={styles.itemRow}><span style={styles.itemRowLeft}><span style={styles.chevSpacer} /><span style={{ ...styles.detailItem, color: "var(--zero)" }}>{label}</span></span><span style={styles.editRowRight}><span style={{ ...styles.detailTotal, color: "var(--zero)" }}>¥0</span><span style={styles.chevRSpacer} /></span></div>;
  }
  if (its.length === 1) {
    return (
      <button style={styles.itemRow} onClick={() => onEdit(its[0])}>
        <span style={styles.itemRowLeft}><span style={styles.chevSpacer} /><span style={styles.detailItem}>{label}</span></span>
        <span style={styles.editRowRight}><span style={styles.detailTotal}>{yen(its[0].amount)}</span><span style={styles.chev}>›</span></span>
      </button>
    );
  }
  const isOpen = !!open[gkey];
  return (
    <div>
      <button style={styles.itemRow} onClick={() => toggle(gkey)}>
        <span style={styles.itemRowLeft}>
          <span style={{ ...styles.chev, transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s", width: 16 }}>›</span>
          <span style={styles.detailItem}>{label}</span><span style={styles.countBadge}>{its.length}件</span>
        </span>
        <span style={styles.editRowRight}><span style={styles.detailTotal}>{yen(total)}</span><span style={styles.chevRSpacer} /></span>
      </button>
      {isOpen && its.map((e, i) => (
        <button key={e.id} style={styles.editSubRow} onClick={() => onEdit(e)}>
          <span style={{ color: MUTED, fontSize: 12.5 }}>{i + 1}件目</span>
          <span style={styles.editRowRight}><span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{yen(e.amount)}</span><span style={styles.chev}>›</span></span>
        </button>
      ))}
    </div>
  );
}

export function DetailCards({ S, config, cards, onEdit }) {
  const [open, setOpen] = useState({});
  const [sections, setSections] = useState({ salary: true, card: true });
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const toggleSection = (key) => setSections((value) => ({ ...value, [key]: !value[key] }));
  const rowProps = { open, toggle, onEdit };

  // 給与
  const salaryItems = config.salaryItems || [];
  const salaryTotal = salaryItems.reduce((a, it) => a + S.totalOf("salary|" + it + "|"), 0);
  // カード
  const cardTotal = (cards || []).reduce((a, c) => a + S.totalOf("card|" + c.name + "|"), 0);
  // 口座
  const balTotalAll = S.accounts.reduce((a, acc) => a + S.totalOf(`account|残高|${acc}`), 0);
  const activeSalary = salaryItems.filter((it) => S.get("salary", it, "").entries.length > 0);
  const activeCards = (cards || []).filter((c) => S.get("card", c.name, "").entries.length > 0);
  const activeAccounts = S.accounts.map((acc) => ({ acc, flows: S.flowsFor(acc).filter((t) => S.get("account", t, acc).entries.length > 0) })).filter((row) => row.flows.length > 0);
  const activeBalances = S.accounts.filter((acc) => S.get("account", "残高", acc).entries.length > 0);
  const section = (key, label, total, children, count) => (
    <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
      <button style={{ ...styles.collapseRow, borderBottom: sections[key] ? `1px solid ${LINE}` : "none" }} onClick={() => toggleSection(key)} aria-expanded={!!sections[key]}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: sections[key] ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>{label}{count > 0 && <span style={styles.countBadge}>{count}</span>}</span>
        <span style={{ ...styles.detailTotal, color: total < 0 ? RED : INK }}>{yen(total)}</span>
      </button>
      {sections[key] && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );

  return (
    <>
      {activeSalary.length > 0 && section("salary", "給与", salaryTotal, activeSalary.map((it) => <ItemRow key={it} label={it} node={S.get("salary", it, "")} gkey={"salary|" + it} {...rowProps} />), activeSalary.length)}
      {activeCards.length > 0 && section("card", "カード", cardTotal, activeCards.map((c) => <ItemRow key={c.id} label={c.name} node={S.get("card", c.name, "")} gkey={"card|" + c.name} {...rowProps} />), activeCards.length)}
      {activeAccounts.length > 0 && section("account", "口座入出金", activeAccounts.reduce((sum, row) => sum + row.flows.reduce((v, t) => v + S.totalOf(`account|${t}|${row.acc}`), 0), 0), activeAccounts.map(({ acc, flows }) => {
          const accTotal = flows.reduce((b, t) => b + S.totalOf(`account|${t}|${acc}`), 0);
          return (
            <div key={acc}>
              <div style={styles.subGroupHead}><span>{acc}</span><span style={styles.editRowRight}><span style={styles.subGroupTotal}>{yen(accTotal)}</span><span style={styles.chevRSpacer} /></span></div>
              {flows.map((t) => <ItemRow key={t} label={t} node={S.get("account", t, acc)} gkey={`acct|${acc}|${t}`} {...rowProps} />)}
            </div>
          );
        }), activeAccounts.length)}
      {activeBalances.length > 0 && section("balance", "口座残高", balTotalAll, activeBalances.map((acc) => <ItemRow key={acc} label={acc} node={S.get("account", "残高", acc)} gkey={`bal|${acc}`} {...rowProps} />), activeBalances.length)}
      {activeSalary.length + activeCards.length + activeAccounts.length + activeBalances.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 12 }}>記録なし</div>}
    </>
  );
}

export function DetailTable({ S, config, cards, onEdit }) {
  const salaryItems = config.salaryItems || [];
  const cardList = cards || [];
  const rows = [];
  let maxCount = 1;
  const addItem = (label, node, indent) => { maxCount = Math.max(maxCount, node.entries.length || 0); rows.push({ kind: "item", label, node, indent }); };
  const sub = (label, total) => rows.push({ kind: "sub", label, total });
  const head = (label) => rows.push({ kind: "head", label });

  // 給与系
  head("給与系");
  salaryItems.forEach((it) => addItem(it, S.get("salary", it, "")));
  const salaryTotal = salaryItems.reduce((a, it) => a + S.totalOf("salary|" + it + "|"), 0);
  sub("給与計", salaryTotal);

  // カード
  head("カード");
  cardList.forEach((c) => addItem(c.name, S.get("card", c.name, "")));
  const cardTotal = cardList.reduce((a, c) => a + S.totalOf("card|" + c.name + "|"), 0);
  sub("カード計", cardTotal);

  // 口座(入出金・振替): 口座ごとに小見出し + 種類行(口座名は繰り返さない)
  head("口座（入出金・振替）");
  S.accounts.forEach((acc) => {
    rows.push({ kind: "acct", label: acc });
    S.flowsFor(acc).forEach((t) => addItem(t, S.get("account", t, acc), true));
  });
  const flowTotal = S.accounts.reduce((a, acc) => a + S.flowsFor(acc).reduce((b, t) => b + S.totalOf(`account|${t}|${acc}`), 0), 0);
  sub("入出金 計", flowTotal);

  // 口座残高
  head("口座残高");
  S.accounts.forEach((acc) => addItem(acc, S.get("account", "残高", acc)));
  const balTotal = S.accounts.reduce((a, acc) => a + S.totalOf(`account|残高|${acc}`), 0);
  sub("残高計", balTotal);

  const cols = Array.from({ length: maxCount }, (_, i) => i + 1);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, width: 132 + (cols.length + 1) * 96 }}>
          <colgroup><col style={{ width: 132 }} />{cols.map((c) => <col key={"col-" + c} style={{ width: 96 }} />)}<col style={{ width: 96 }} /></colgroup>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>項目</th>{cols.map((c) => <th style={styles.th} key={c}>{c}</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>計</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "head") return <tr key={i}><td style={styles.tdGroup} colSpan={cols.length + 2}>{r.label}</td></tr>;
              if (r.kind === "acct") return <tr key={i}><td style={styles.tdAcct} colSpan={cols.length + 2}>{r.label}</td></tr>;
              if (r.kind === "sub") return (<tr key={i}><td style={{ ...styles.td, ...styles.tdSticky, ...styles.tdSubLabel }}>{r.label}</td>{cols.map((c) => <td key={c} style={{ ...styles.tdNum, ...styles.tdSubLabel }}></td>)}<td style={{ ...styles.tdNum, ...styles.tdSubTotal }}>{num(r.total)}</td></tr>);
              const its = r.node.entries; const total = its.reduce((a, e) => a + e.amount, 0);
              const zero = its.length === 0;
              return (
                <tr key={i}>
                  <td
                    style={{ ...styles.td, ...styles.tdSticky, ...(r.indent ? { padding: "8px 10px 8px 20px" } : {}), ...(zero ? { color: "var(--zero)" } : {}) }}>{r.label}</td>
                  {cols.map((c) => { const e = its[c - 1]; return <td style={styles.tdNum} key={c}>{e ? <button style={styles.cellBtn} onClick={() => onEdit(e)}>{num(e.amount)}</button> : ""}</td>; })}
                  <td
                    style={{ ...styles.tdNum, ...styles.tdTotalCell, ...(zero ? { color: "var(--zero)" } : {}) }}>{zero ? "0" : num(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function YearTable({ entries, ym, config, cards }) {
  const [openGroups, setOpenGroups] = useState({});
  const salaryItems = config.salaryItems || [];
  const cardList = cards || [];
  const accounts = config.accounts || [];
  // 起点は当年4月〜翌3月(年度)。ym の年から年度開始を決める。
  const [y, m] = ym.split("-").map(Number);
  const fyStart = m >= 4 ? y : y - 1;
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(fyStart, 3 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });

  // 月×キー の合計を集計
  const sums = useMemo(() => {
    const map = {}; // `${ym}|${cat}|${item}|${account}` -> total
    for (const e of entries) {
      const key = `${e.ym}|${e.cat}|${e.item}|${e.cat === "account" ? e.account : ""}`;
      map[key] = (map[key] || 0) + e.amount;
    }
    return map;
  }, [entries]);
  const val = (mo, cat, item, account) => sums[`${mo}|${cat}|${item}|${account || ""}`] || 0;
  const hasAnnualValue = (cat, item, account = "") => months.some((mo) => val(mo, cat, item, account) !== 0);
  const visibleSalaryItems = salaryItems.filter((item) => hasAnnualValue("salary", item));
  const visibleCards = cardList.filter((card) => hasAnnualValue("card", card.name));

  const summaryByMonth = useMemo(() => {
    const map = {};
    for (const mo of months) map[mo] = computeSummary(entries.filter((e) => e.ym === mo));
    return map;
  }, [entries, fyStart]);
  const open = (key) => !!openGroups[key];
  const toggle = (key) => setOpenGroups((value) => ({ ...value, [key]: !value[key] }));
  const accountRows = (roles) => accounts.flatMap((account) => flowTypesFor(account, config)
    .filter((item) => roles.includes(acctRole(item)) && hasAnnualValue("account", item, account))
    .map((item) => ({ account, item })));
  const incomeRows = accountRows(["in"]);
  const expenseRows = accountRows(["out"]);
  const transferRows = accountRows(["transfer", "neutral"]);
  const visibleBalances = accounts.filter((account) => hasAnnualValue("account", "残高", account));
  const group = (key, label, value) => ({ key, label, kind: "summary", value, open: open(key), onToggle: () => toggle(key) });
  const child = (key, label, value, groupKey) => ({ key, label, value, indent: true, hidden: !open(groupKey) });
  const rows = [
    group("salary", "給与", (mo) => summaryByMonth[mo]?.salaryIncome || 0),
    ...visibleSalaryItems.map((item) => child(`salary|${item}`, item, (mo) => val(mo, "salary", item, ""), "salary")),
    group("other", "その他", (mo) => summaryByMonth[mo]?.otherIncome || 0),
    ...incomeRows.map(({ account, item }) => child(`in|${account}|${item}`, `${account} / ${item}`, (mo) => val(mo, "account", item, account), "other")),
    { key: "income", label: "収入計", kind: "summary", value: (mo) => summaryByMonth[mo]?.income || 0 },
    group("spending", "支出", (mo) => summaryByMonth[mo]?.expense || 0),
    ...visibleCards.map((card) => child(`card|${card.id}`, card.name, (mo) => val(mo, "card", card.name, ""), "spending")),
    ...expenseRows.map(({ account, item }) => child(`out|${account}|${item}`, `${account} / ${item}`, (mo) => Math.abs(val(mo, "account", item, account)), "spending")),
    group("invest", "投資振替", (mo) => summaryByMonth[mo]?.invest || 0),
    ...transferRows.map(({ account, item }) => child(`transfer|${account}|${item}`, `${account} / ${item}`, (mo) => val(mo, "account", item, account), "invest")),
    { key: "net", label: "収支", kind: "net", value: (mo) => summaryByMonth[mo]?.net || 0 },
    group("balance", "口座残高", (mo) => summaryByMonth[mo]?.balTotal || 0),
    ...visibleBalances.map((account) => child(`balance|${account}`, account, (mo) => val(mo, "account", "残高", account), "balance")),
  ];
  const columns = months.map((mo) => ({ key: mo, label: `${parseInt(mo.split("-")[1], 10)}月` }));
  return (
    <div style={{ marginTop: 4 }}>
      <SavingsChart entries={entries} months={months} ym={ym} />
      <AnnualMatrix columns={columns} rows={rows} currentKey={ym} />
    </div>
  );
}

// 年度内の月ごとの貯蓄率(収支÷収入)を並べた簡易チャート
function SavingsChart({ entries, months, ym }) {
  const [open, setOpen] = useState(false);
  const rates = useMemo(() => months.map((mo) => {
    const s = computeSummary(entries.filter((e) => e.ym === mo));
    return { mo, rate: s.income > 0 ? s.net / s.income : null };
  }), [entries, months]);
  const withData = rates.filter((r) => r.rate != null);
  if (!withData.length) return null;
  const avg = withData.reduce((a, r) => a + r.rate, 0) / withData.length;
  const maxAbs = Math.max(0.2, ...withData.map((r) => Math.abs(r.rate)));
  const W = 442, H = 132, padBottom = 20, topH = (H - padBottom) * 0.62, midY = topH, barAreaH = H - padBottom - 12;
  const colW = W / months.length;
  return (
    <div style={{ ...styles.detailCard, marginBottom: 10, padding: "0 14px" }}>
      <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>貯蓄率</span>
        <span style={{ ...styles.detailTotal, color: avg >= 0 ? GREEN : RED }}>平均 {Math.round(avg * 100)}%</span>
      </button>
      {open && <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", padding: "8px 0 4px" }}>
        <line x1={0} y1={midY} x2={W} y2={midY} stroke={LINE} strokeWidth={1} />
        {rates.map((r, i) => {
          if (r.rate == null) return null;
          const w = colW * 0.56;
          const x = i * colW + (colW - w) / 2;
          const h = Math.max(2, Math.min(barAreaH / 2, (Math.abs(r.rate) / maxAbs) * (barAreaH / 2)));
          const y = r.rate >= 0 ? midY - h : midY;
          const color = r.rate >= 0 ? GREEN : RED;
          return (
            <g key={r.mo}>
              <rect x={x} y={y} width={w} height={h} fill={color} rx={2} opacity={r.mo === ym ? 1 : 0.5} />
              <text x={x + w / 2} y={r.rate >= 0 ? y - 3 : y + h + 11} fontSize="9" textAnchor="middle" fill={MUTED}>{Math.round(r.rate * 100)}%</text>
            </g>
          );
        })}
        {months.map((mo, i) => (
          <text key={mo} x={i * colW + colW / 2} y={H - 5} fontSize="9.5" textAnchor="middle" fill={mo === ym ? ACCENT : MUTED} fontWeight={mo === ym ? 700 : 400}>{parseInt(mo.split("-")[1], 10)}月</text>
        ))}
      </svg>}
    </div>
  );
}
