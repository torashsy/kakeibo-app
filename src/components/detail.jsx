import React, { useMemo, useState } from "react";
import { ACCENT, INK, MUTED, RED, GREEN } from '../theme.js';
import { yen, num, buildStructure } from '../utils.js';
import { styles } from '../styles.js';
import { Editable } from '../edit.jsx';

export function Detail({ monthEntries, entries, ym, config, cards, onEdit }) {
  const [view, setView] = useState("card");
  const S = useMemo(() => buildStructure(monthEntries, config, cards), [monthEntries, config, cards]);
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.viewToggle}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "list" ? styles.viewToggleActive : {}) }} onClick={() => setView("list")}>履歴</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "card" ? styles.viewToggleActive : {}) }} onClick={() => setView("card")}>項目別</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "table" ? styles.viewToggleActive : {}) }} onClick={() => setView("table")}>表</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "year" ? styles.viewToggleActive : {}) }} onClick={() => setView("year")}>年間</button>
      </div>
      {view === "list" && <DetailList monthEntries={monthEntries} onEdit={onEdit} />}
      {view === "card" && <DetailCards S={S} config={config} cards={cards} onEdit={onEdit} />}
      {view === "table" && <DetailTable S={S} config={config} cards={cards} onEdit={onEdit} />}
      {view === "year" && <YearTable entries={entries} ym={ym} config={config} cards={cards} />}
    </div>
  );
}

export function DetailList({ monthEntries, onEdit }) {
  const catLabel = { salary: "給与系", card: "カード", account: "口座" };
  const catColor = { salary: GREEN, card: RED, account: ACCENT };
  const list = [...monthEntries].reverse();
  if (!list.length) return <div style={{ color: MUTED, fontSize: 13, padding: 12 }}>この月の記録はまだありません。右下の＋から追加できます。</div>;
  return (
    <div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 10px" }}>追加した記録の一覧です。行をタップすると編集・削除できます。</div>
      <div style={styles.detailCard}>
        {list.map((e) => (
          <button key={e.id} style={styles.listRow} onClick={() => onEdit(e)}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{e.cat === "account" ? `${e.item}・${e.account}` : e.item}</span>
              <span style={{ ...styles.catTag, color: catColor[e.cat], borderColor: catColor[e.cat] }}>{catLabel[e.cat]}</span>
            </span>
            <span style={styles.editRowRight}>
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: e.amount < 0 ? RED : INK }}>{yen(e.amount)}</span>
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
    return <div style={styles.itemRow}><span style={styles.itemRowLeft}><span style={styles.chevSpacer} /><span style={{ ...styles.detailItem, color: "#BBB6AC" }}>{label}</span></span><span style={{ ...styles.detailTotal, color: "#C9C5BC" }}>¥0</span></div>;
  }
  if (its.length === 1) {
    return (
      <button style={styles.itemRow} onClick={() => onEdit(its[0])}>
        <span style={styles.itemRowLeft}><span style={styles.chevSpacer} /><Editable id="detail.item" tag="span" base={styles.detailItem}>{label}</Editable></span>
        <span style={styles.editRowRight}><Editable id="detail.total" tag="span" base={styles.detailTotal}>{yen(its[0].amount)}</Editable><span style={styles.chev}>›</span></span>
      </button>
    );
  }
  const isOpen = !!open[gkey];
  return (
    <div>
      <button style={styles.itemRow} onClick={() => toggle(gkey)}>
        <span style={styles.itemRowLeft}>
          <span style={{ ...styles.chev, transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s", width: 16 }}>›</span>
          <Editable id="detail.item" tag="span" base={styles.detailItem}>{label}</Editable><span style={styles.countBadge}>{its.length}件</span>
        </span>
        <Editable id="detail.total" tag="span" base={styles.detailTotal}>{yen(total)}</Editable>
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
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const rowProps = { open, toggle, onEdit };

  // 給与
  const salaryItems = config.salaryItems || [];
  const salaryTotal = salaryItems.reduce((a, it) => a + S.totalOf("salary|" + it + "|"), 0);
  // カード
  const cardTotal = (cards || []).reduce((a, c) => a + S.totalOf("card|" + c.name + "|"), 0);
  // 口座
  const balTotalAll = S.accounts.reduce((a, acc) => a + S.totalOf(`account|残高|${acc}`), 0);

  return <>
    <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 10px" }}>0円の項目も表示しています。複数回入力した項目はタップで開けます。</div>

    {/* 給与系 */}
    <div style={{ marginBottom: 18 }}>
      <Editable id="card.groupHead" base={styles.detailHead}><span>給与系</span></Editable>
      <div style={styles.detailCard}>
        {salaryItems.map((it) => <ItemRow key={it} label={it} node={S.get("salary", it, "")} gkey={"salary|" + it} {...rowProps} />)}
        <Editable id="detail.subtotal" base={styles.subtotalRow}><span>給与計</span><span>{yen(salaryTotal)}</span></Editable>
      </div>
    </div>

    {/* カード */}
    <div style={{ marginBottom: 18 }}>
      <Editable id="card.groupHead" base={styles.detailHead}><span>カード</span></Editable>
      <div style={styles.detailCard}>
        {(cards || []).map((c) => <ItemRow key={c.id} label={c.name} node={S.get("card", c.name, "")} gkey={"card|" + c.name} {...rowProps} />)}
        <Editable id="detail.subtotal" base={styles.subtotalRow}><span>カード計</span><span>{yen(cardTotal)}</span></Editable>
      </div>
    </div>

    {/* 口座: 口座ごとにまとめる */}
    <div style={{ marginBottom: 8 }}>
      <Editable id="card.groupHead" base={styles.detailHead}><span>口座（入出金・振替）</span></Editable>
      {S.accounts.map((acc) => {
        const accTotal = S.flowTypes.reduce((b, t) => b + S.totalOf(`account|${t}|${acc}`), 0);
        return (
          <div key={acc} style={{ ...styles.detailCard, marginBottom: 10 }}>
            <Editable id="card.acctHead" base={styles.subGroupHead}><span>{acc}</span><span style={styles.subGroupTotal}>{yen(accTotal)}</span></Editable>
            {S.flowTypes.map((t) => <ItemRow key={t} label={t} node={S.get("account", t, acc)} gkey={`acct|${acc}|${t}`} {...rowProps} />)}
          </div>
        );
      })}
    </div>

    {/* 口座残高 */}
    <div style={{ marginBottom: 18 }}>
      <Editable id="card.groupHead" base={styles.detailHead}><span>口座残高</span></Editable>
      <div style={styles.detailCard}>
        {S.accounts.map((acc) => <ItemRow key={acc} label={acc} node={S.get("account", "残高", acc)} gkey={`bal|${acc}`} {...rowProps} />)}
        <Editable id="detail.subtotal" base={styles.subtotalRow}><span>残高計</span><span>{yen(balTotalAll)}</span></Editable>
      </div>
    </div>
  </>;
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
    S.flowTypes.forEach((t) => addItem(t, S.get("account", t, acc), true));
  });
  const flowTotal = S.accounts.reduce((a, acc) => a + S.flowTypes.reduce((b, t) => b + S.totalOf(`account|${t}|${acc}`), 0), 0);
  sub("入出金・振替 計", flowTotal);

  // 口座残高
  head("口座残高");
  S.accounts.forEach((acc) => addItem(acc, S.get("account", "残高", acc)));
  const balTotal = S.accounts.reduce((a, acc) => a + S.totalOf(`account|残高|${acc}`), 0);
  sub("残高計", balTotal);

  const cols = Array.from({ length: maxCount }, (_, i) => i + 1);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>項目別と同じ並びです。横スクロール可。数字をタップで編集。</div>
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead><tr><Editable tag="th" id="table.th" base={{ ...styles.th, ...styles.thSticky }}>項目</Editable>{cols.map((c) => <Editable tag="th" id="table.th" key={c} base={styles.th}>{c}</Editable>)}<Editable tag="th" id="table.th" base={{ ...styles.th, ...styles.thTotal }}>計</Editable></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "head") return <tr key={i}><Editable tag="td" id="table.group" colSpan={cols.length + 2} base={styles.tdGroup}>{r.label}</Editable></tr>;
              if (r.kind === "acct") return <tr key={i}><Editable tag="td" id="table.acct" colSpan={cols.length + 2} base={styles.tdAcct}>{r.label}</Editable></tr>;
              if (r.kind === "sub") return (
                <tr key={i}><Editable tag="td" id="table.subtotal" base={{ ...styles.td, ...styles.tdSticky, ...styles.tdSubLabel }}>{r.label}</Editable>{cols.map((c) => <td key={c} style={{ ...styles.tdNum, ...styles.tdSubLabel }}></td>)}<Editable tag="td" id="table.subtotal" base={{ ...styles.tdNum, ...styles.tdSubTotal }}>{num(r.total)}</Editable></tr>
              );
              const its = r.node.entries; const total = its.reduce((a, e) => a + e.amount, 0);
              const zero = its.length === 0;
              return (
                <tr key={i}>
                  <Editable tag="td" id="table.rowlabel" base={{ ...styles.td, ...styles.tdSticky, ...(r.indent ? { paddingLeft: 20 } : {}), ...(zero ? { color: "#C9C5BC" } : {}) }}>{r.label}</Editable>
                  {cols.map((c) => { const e = its[c - 1]; return <Editable tag="td" id="table.cell" key={c} base={styles.tdNum}>{e ? <button style={styles.cellBtn} onClick={() => onEdit(e)}>{num(e.amount)}</button> : ""}</Editable>; })}
                  <Editable tag="td" id="table.totalcell" base={{ ...styles.tdNum, ...styles.tdTotalCell, ...(zero ? { color: "#C9C5BC" } : {}) }}>{zero ? "0" : num(total)}</Editable>
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
  const salaryItems = config.salaryItems || [];
  const cardList = cards || [];
  const accounts = config.accounts || [];
  const flowTypes = ["預入", "受取", "引出", "送金", "投資振替"];
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

  // 行定義
  const rows = [];
  rows.push({ kind: "head", label: "給与系" });
  salaryItems.forEach((it) => rows.push({ kind: "row", label: it, get: (mo) => val(mo, "salary", it, "") }));
  rows.push({ kind: "sub", label: "給与計", get: (mo) => salaryItems.reduce((a, it) => a + val(mo, "salary", it, ""), 0) });
  rows.push({ kind: "head", label: "カード" });
  cardList.forEach((c) => rows.push({ kind: "row", label: c.name, get: (mo) => val(mo, "card", c.name, "") }));
  rows.push({ kind: "sub", label: "カード計", get: (mo) => cardList.reduce((a, c) => a + val(mo, "card", c.name, ""), 0) });
  rows.push({ kind: "head", label: "口座（入出金・振替）" });
  accounts.forEach((acc) => {
    rows.push({ kind: "acct", label: acc });
    flowTypes.forEach((t) => rows.push({ kind: "row", label: t, indent: true, get: (mo) => val(mo, "account", t, acc) }));
  });
  rows.push({ kind: "sub", label: "入出金・振替 計", get: (mo) => accounts.reduce((a, acc) => a + flowTypes.reduce((b, t) => b + val(mo, "account", t, acc), 0), 0) });
  rows.push({ kind: "head", label: "口座残高" });
  accounts.forEach((acc) => rows.push({ kind: "row", label: acc, get: (mo) => val(mo, "account", "残高", acc) }));
  rows.push({ kind: "sub", label: "残高計", get: (mo) => accounts.reduce((a, acc) => a + val(mo, "account", "残高", acc), 0) });

  const mlabel = (mo) => parseInt(mo.split("-")[1], 10) + "月";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>{fyStart}年4月〜{fyStart + 1}年3月の12か月。横スクロールできます。</div>
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>項目</th>{months.map((mo) => <th key={mo} style={{ ...styles.th, ...(mo === ym ? { color: ACCENT } : {}) }}>{mlabel(mo)}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "head") return <tr key={i}><td colSpan={months.length + 1} style={styles.tdGroup}>{r.label}</td></tr>;
              if (r.kind === "acct") return <tr key={i}><td colSpan={months.length + 1} style={styles.tdAcct}>{r.label}</td></tr>;
              const isSub = r.kind === "sub";
              return (
                <tr key={i}>
                  <td style={{ ...styles.td, ...styles.tdSticky, ...(isSub ? styles.tdSubLabel : {}), ...(r.indent ? { paddingLeft: 20 } : {}) }}>{r.label}</td>
                  {months.map((mo) => { const v = r.get(mo); return <td key={mo} style={{ ...styles.tdNum, ...(isSub ? styles.tdSubTotal : {}), ...(mo === ym ? { background: "#F4F8F6" } : {}), ...(v === 0 ? { color: "#D5D1C8" } : {}) }}>{v === 0 ? "·" : num(v)}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
