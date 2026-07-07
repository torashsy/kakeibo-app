import React, { useState, useEffect, useMemo } from "react";
import { MUTED, DEFAULT_THEME, themeVars } from './theme.js';
import { ymLabel, uid, addMonth, migrateEntry, migrateConfig, DEFAULT_CONFIG, acctRole, DEFAULT_CARDS, SEED_ENTRIES, SEED_DEBT, SEED_MEMOS, SEED_SUBS, computeSummary } from './utils.js';
import { styles } from './styles.js';
import { Summary } from './components/summary.jsx';
import { Detail } from './components/detail.jsx';
import { Cards } from './components/cards.jsx';
import { MemoTab } from './components/memos.jsx';
import { Settings, ThemeEditor } from './components/settings.jsx';
import { PickCategory, SalaryForm, SalaryEditForm, CardForm, AccountForm } from './components/forms.jsx';
import { Icon } from './icons.jsx';

export default function App() {
  const [entries, setEntries] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [cards, setCards] = useState([]);
  const [debt, setDebt] = useState({});
  const [memos, setMemos] = useState([]);
  const [subs, setSubs] = useState([]);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("summary");
  const [ym, setYm] = useState("2026-06");
  const [sheet, setSheet] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [e, c, cd, d, th, mm, sb] = await Promise.all([
          window.storage.get("entries", true).catch(() => null),
          window.storage.get("config", true).catch(() => null),
          window.storage.get("cards", true).catch(() => null),
          window.storage.get("debt", true).catch(() => null),
          window.storage.get("theme", true).catch(() => null),
          window.storage.get("memos", true).catch(() => null),
          window.storage.get("subs", true).catch(() => null),
        ]);
        const rawEntries = e && e.value ? JSON.parse(e.value) : null;
        if (rawEntries) {
          const migrated = rawEntries.map(migrateEntry).filter(Boolean);
          setEntries(migrated);
          // 変換が発生していたら保存し直して永続化(臨時収入の口座移動など)
          const changed = migrated.length !== rawEntries.length || migrated.some((m, i) => !rawEntries[i] || m.cat !== rawEntries[i].cat || m.item !== rawEntries[i].item);
          if (changed) { try { window.storage.set("entries", JSON.stringify(migrated), true); } catch {} }
        } else {
          setEntries(SEED_ENTRIES.map((x) => ({ ...x, id: uid() })));
        }
        setConfig(migrateConfig(c && c.value ? { ...DEFAULT_CONFIG, ...JSON.parse(c.value) } : DEFAULT_CONFIG));
        const rawCards = cd && cd.value ? JSON.parse(cd.value) : null;
        setCards(Array.isArray(rawCards) && rawCards.length ? rawCards.map((c) => typeof c === "string" ? { id: uid(), name: c, brand: "", note: "", annualFee: 0 } : { id: c.id || uid(), name: c.name || "", brand: c.brand || "", note: c.note || "", annualFee: Number(c.annualFee) || 0 }) : DEFAULT_CARDS);
        const rawDebt = d && d.value ? JSON.parse(d.value) : null;
        setDebt(rawDebt && typeof rawDebt === "object" ? rawDebt : SEED_DEBT);
        setTheme(th && th.value ? { ...DEFAULT_THEME, ...JSON.parse(th.value) } : DEFAULT_THEME);
        const rawMemos = mm && mm.value ? JSON.parse(mm.value) : null;
        setMemos(Array.isArray(rawMemos) ? rawMemos : SEED_MEMOS);
        const rawSubs = sb && sb.value ? JSON.parse(sb.value) : null;
        setSubs(Array.isArray(rawSubs) ? rawSubs : SEED_SUBS);
      } catch {
        setEntries(SEED_ENTRIES.map((x) => ({ ...x, id: uid() }))); setCards(DEFAULT_CARDS); setDebt(SEED_DEBT);
      } finally { setLoaded(true); }
    })();
  }, []);

  const save = (k, v) => { try { window.storage.set(k, JSON.stringify(v), true); } catch (e) { console.error(e); } };
  const commitConfig = (n) => { setConfig(n); save("config", n); };
  const commitCards = (n) => { setCards(n); save("cards", n); };
  const commitDebt = (n) => { setDebt(n); save("debt", n); };
  const commitMemos = (n) => { setMemos(n); save("memos", n); };
  const commitSubs = (n) => { setSubs(n); save("subs", n); };
  const commitTheme = (n) => { setTheme(n); save("theme", n); };

  const addEntry = (e) => { const w = { ...e, id: uid() }; setEntries((prev) => { const n = [...prev, w]; save("entries", n); return n; }); return w; };
  const updateEntry = (e) => setEntries((prev) => { const n = prev.map((x) => (x.id === e.id ? e : x)); save("entries", n); return n; });
  const removeEntry = (id) => setEntries((prev) => { const n = prev.filter((x) => x.id !== id); save("entries", n); return n; });
  const removeEntriesMatching = (pred) => setEntries((prev) => { const n = prev.filter((x) => !pred(x)); save("entries", n); return n; });

  // カード/口座/給与項目の削除は、紐づく記録も一緒に消さないと
  // 「詳細」からは消えたのに「サマリ」の集計にだけ残り続ける、というズレが起きるため
  // 件数を確認のうえカスケード削除する
  const removeCard = (card) => {
    const count = entries.filter((e) => e.cat === "card" && e.item === card.name).length;
    if (count > 0 && !window.confirm(`「${card.name}」の記録が${count}件あります。カードを削除すると、それらの記録も一緒に削除されます。よろしいですか？`)) return;
    commitCards(cards.filter((c) => c.id !== card.id));
    if (count > 0) removeEntriesMatching((e) => e.cat === "card" && e.item === card.name);
    if (debt[card.name]) { const nd = { ...debt }; delete nd[card.name]; commitDebt(nd); }
  };
  const removeConfigItem = (key, name) => {
    const pred = key === "accounts" ? (e) => e.cat === "account" && e.account === name : (e) => e.cat === "salary" && e.item === name;
    const count = entries.filter(pred).length;
    const label = key === "accounts" ? "口座" : "給与系の項目";
    if (count > 0 && !window.confirm(`「${name}」の記録が${count}件あります。${label}を削除すると、それらの記録も一緒に削除されます。よろしいですか？`)) return;
    commitConfig({ ...config, [key]: (config[key] || []).filter((x) => x !== name) });
    if (count > 0) removeEntriesMatching(pred);
  };
  const replaceSalary = (targetYm, rows) => {
    setEntries((prev) => {
      const kept = prev.filter((x) => !(x.ym === targetYm && x.cat === "salary"));
      const added = rows.filter((r) => r.amount !== "" && !isNaN(parseFloat(r.amount)))
        .map((r) => ({ id: uid(), ym: targetYm, cat: "salary", item: r.item, account: "", amount: r.item === "控除" ? -Math.abs(parseFloat(r.amount)) : parseFloat(r.amount) }));
      const n = [...kept, ...added]; save("entries", n); return n;
    });
  };

  const months = useMemo(() => { const s = new Set(entries.map((e) => e.ym)); s.add(ym); return Array.from(s).sort(); }, [entries, ym]);
  const monthEntries = useMemo(() => entries.filter((e) => e.ym === ym), [entries, ym]);

  const summary = useMemo(() => computeSummary(monthEntries), [monthEntries]);

  const prevBalTotal = useMemo(() => {
    const pym = addMonth(ym, -1); const b = {};
    for (const e of entries) if (e.ym === pym && e.cat === "account" && acctRole(e.item) === "bal") b[e.account] = e.amount;
    return Object.keys(b).length ? Object.values(b).reduce((a, x) => a + x, 0) : null;
  }, [entries, ym]);

  if (!loaded) return <div style={{ ...styles.app, ...themeVars(DEFAULT_THEME), display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: MUTED }}>読み込み中…</span></div>;

  return (
    <div style={{ ...styles.app, ...themeVars(theme) }}>
      <header style={styles.header}>
        <div style={styles.brandRow}><span style={styles.brand}>家計簿</span><span style={styles.cloud}>☁ 同期</span></div>
        {tab !== "cards" && tab !== "settings" && tab !== "design" && tab !== "memos" && (
          <div style={styles.monthPicker}>
            <button style={styles.monthArrow} onClick={() => { const i = months.indexOf(ym); if (i > 0) setYm(months[i - 1]); }}>‹</button>
            <select value={ym} onChange={(e) => setYm(e.target.value)} style={styles.monthSelect}>{months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}</select>
            <button style={styles.monthArrow} onClick={() => { const i = months.indexOf(ym); if (i < months.length - 1) setYm(months[i + 1]); }}>›</button>
          </div>
        )}
      </header>

      <main style={styles.main}>
        {tab === "summary" && <Summary summary={summary} prevBalTotal={prevBalTotal} />}
        {tab === "detail" && <Detail monthEntries={monthEntries} entries={entries} ym={ym} config={config} cards={cards} onEdit={(e) => { setEditing(e); setSheet(e.cat === "salary" ? "salaryEdit" : e.cat); }} />}
        {tab === "cards" && <Cards cards={cards} debt={debt} ym={ym} entries={entries} onSaveCards={commitCards} onSaveDebt={commitDebt} onRemoveCard={removeCard} />}
        {tab === "memos" && <MemoTab memos={memos} onSaveMemos={commitMemos} subs={subs} onSaveSubs={commitSubs} cards={cards} />}
        {tab === "settings" && <Settings config={config} onSave={commitConfig} entries={entries} cards={cards} debt={debt} theme={theme} onOpenDesign={() => setTab("design")} onRemoveItem={removeConfigItem} />}
        {tab === "design" && <ThemeEditor theme={theme} onSave={commitTheme} onBack={() => setTab("settings")} />}
      </main>

      {(tab === "summary" || tab === "detail") && <button style={styles.fab} onClick={() => setSheet("pick")}><span style={{ fontSize: 26, marginTop: -2 }}>＋</span></button>}

      <nav style={styles.tabs}>
        <TabBtn active={tab === "summary"} onClick={() => setTab("summary")} label="サマリ" icon="summary" />
        <TabBtn active={tab === "detail"} onClick={() => setTab("detail")} label="詳細" icon="detail" />
        <TabBtn active={tab === "cards"} onClick={() => setTab("cards")} label="カード" icon="card" />
        <TabBtn active={tab === "memos"} onClick={() => setTab("memos")} label="メモ" icon="memo" />
        <TabBtn active={tab === "settings" || tab === "design"} onClick={() => setTab("settings")} label="設定" icon="settings" />
      </nav>

      {sheet === "pick" && <PickCategory onClose={() => setSheet(null)} onPick={(cat) => { setEditing(null); setSheet(cat); }} />}
      {sheet === "salary" && <SalaryForm key={ym} ym={ym} config={config} entries={entries} onClose={() => { setSheet(null); setEditing(null); }} onSave={(rows) => { replaceSalary(ym, rows); setSheet(null); }} />}
      {sheet === "salaryEdit" && <SalaryEditForm key={editing ? editing.id : "s"} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "card" && <CardForm key={editing ? editing.id : "new-card"} ym={ym} cards={cards} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onAdd={addEntry} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "account" && <AccountForm key={editing ? editing.id : "new-account"} ym={ym} config={config} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onAdd={addEntry} onUpdate={updateEntry} onDelete={removeEntry} />}
    </div>
  );
}

function TabBtn({ active, onClick, label, icon }) {
  return <button onClick={onClick} style={{ ...styles.tabBtn, color: active ? "var(--tab-active)" : MUTED }}><Icon name={icon} size={22} strokeWidth={active ? 2.1 : 1.8} /><span style={{ fontSize: 10.5, marginTop: 3, fontWeight: active ? 700 : 500 }}>{label}</span></button>;
}
