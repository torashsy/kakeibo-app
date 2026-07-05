import React, { useState, useEffect } from "react";
import { MUTED, DEFAULT_THEME, themeVars } from './theme.js';
import { ymLabel, uid, addMonth, migrateEntry, DEFAULT_CONFIG, acctRole, DEFAULT_CARDS, SEED_ENTRIES, SEED_DEBT } from './utils.js';
import { styles } from './styles.js';
import { EditCtx, Editable } from './edit.jsx';
import { Summary } from './components/summary.jsx';
import { Detail } from './components/detail.jsx';
import { Cards } from './components/cards.jsx';
import { Settings, ThemeEditor, FormatSheet } from './components/settings.jsx';
import { PickCategory, SalaryForm, SalaryEditForm, CardForm, AccountForm } from './components/forms.jsx';

export default function App() {
  const [entries, setEntries] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [cards, setCards] = useState([]);
  const [debt, setDebt] = useState({});
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("summary");
  const [ym, setYm] = useState("2026-06");
  const [sheet, setSheet] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editMode, setEditMode] = useState(false);       // デザイン編集モード
  const [fmtTarget, setFmtTarget] = useState(null);      // 書式編集中の要素id

  useEffect(() => {
    (async () => {
      try {
        const [e, c, cd, d, th] = await Promise.all([
          window.storage.get("entries", true).catch(() => null),
          window.storage.get("config", true).catch(() => null),
          window.storage.get("cards", true).catch(() => null),
          window.storage.get("debt", true).catch(() => null),
          window.storage.get("theme", true).catch(() => null),
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
        setConfig(c && c.value ? { ...DEFAULT_CONFIG, ...JSON.parse(c.value) } : DEFAULT_CONFIG);
        const rawCards = cd && cd.value ? JSON.parse(cd.value) : null;
        setCards(Array.isArray(rawCards) && rawCards.length ? rawCards.map((c) => typeof c === "string" ? { id: uid(), name: c, brand: "", note: "" } : { id: c.id || uid(), name: c.name || "", brand: c.brand || "", note: c.note || "" }) : DEFAULT_CARDS);
        const rawDebt = d && d.value ? JSON.parse(d.value) : null;
        setDebt(rawDebt && typeof rawDebt === "object" ? rawDebt : SEED_DEBT);
        setTheme(th && th.value ? { ...DEFAULT_THEME, ...JSON.parse(th.value) } : DEFAULT_THEME);
      } catch {
        setEntries(SEED_ENTRIES.map((x) => ({ ...x, id: uid() }))); setCards(DEFAULT_CARDS); setDebt(SEED_DEBT);
      } finally { setLoaded(true); }
    })();
  }, []);

  const save = (k, v) => { try { window.storage.set(k, JSON.stringify(v), true); } catch (e) { console.error(e); } };
  const commitConfig = (n) => { setConfig(n); save("config", n); };
  const commitCards = (n) => { setCards(n); save("cards", n); };
  const commitDebt = (n) => { setDebt(n); save("debt", n); };
  const commitTheme = (n) => { setTheme(n); save("theme", n); };

  const addEntry = (e) => { const w = { ...e, id: uid() }; setEntries((prev) => { const n = [...prev, w]; save("entries", n); return n; }); return w; };
  const updateEntry = (e) => setEntries((prev) => { const n = prev.map((x) => (x.id === e.id ? e : x)); save("entries", n); return n; });
  const removeEntry = (id) => setEntries((prev) => { const n = prev.filter((x) => x.id !== id); save("entries", n); return n; });
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

  const summary = useMemo(() => {
    let gross = 0, deduction = 0, cardTotal = 0, cashIn = 0, cashOut = 0, invest = 0; const balances = {};
    for (const e of monthEntries) {
      if (e.cat === "salary") { if (e.item === "控除") deduction += e.amount; else gross += e.amount; }
      else if (e.cat === "card") cardTotal += Math.abs(e.amount);
      else if (e.cat === "account") {
        const role = acctRole(e.item);
        if (role === "bal") balances[e.account] = e.amount;
        else if (role === "transfer") invest += e.amount;        // 符号そのまま(入=−, 戻し=＋ を利用者が符号で表現)
        else if (role === "in") cashIn += Math.abs(e.amount);
        else if (role === "out") cashOut += Math.abs(e.amount);
      }
    }
    const income = gross + deduction + cashIn, expense = cardTotal + cashOut;
    const net = income - expense + invest;   // 投資振替は符号のまま加算(−なら支出方向、＋なら収入方向)
    const balTotal = Object.values(balances).reduce((a, b) => a + b, 0);
    return { gross, deduction, cardTotal, cashIn, cashOut, invest, income, expense, net, balances, balTotal };
  }, [monthEntries]);

  const prevBalTotal = useMemo(() => {
    const pym = addMonth(ym, -1); const b = {};
    for (const e of entries) if (e.ym === pym && e.cat === "account" && acctRole(e.item) === "bal") b[e.account] = e.amount;
    return Object.keys(b).length ? Object.values(b).reduce((a, x) => a + x, 0) : null;
  }, [entries, ym]);

  if (!loaded) return <div style={{ ...styles.app, ...themeVars(DEFAULT_THEME), display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: MUTED }}>読み込み中…</span></div>;

  return (
    <EditCtx.Provider value={{ editMode, overrides: theme.overrides || {}, pick: (id) => setFmtTarget(id) }}>
    <div style={{ ...styles.app, ...themeVars(theme) }}>
      <header style={styles.header}>
        <div style={styles.brandRow}><span style={styles.brand}>家計簿</span><span style={styles.cloud}>☁ 同期</span></div>
        {tab !== "cards" && tab !== "settings" && tab !== "design" && (
          <div style={styles.monthPicker}>
            <button style={styles.monthArrow} onClick={() => { const i = months.indexOf(ym); if (i > 0) setYm(months[i - 1]); }}>‹</button>
            <select value={ym} onChange={(e) => setYm(e.target.value)} style={styles.monthSelect}>{months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}</select>
            <button style={styles.monthArrow} onClick={() => { const i = months.indexOf(ym); if (i < months.length - 1) setYm(months[i + 1]); }}>›</button>
          </div>
        )}
      </header>

      <Editable tag="main" id="app.bg" base={styles.main}>
        {tab === "summary" && <Summary summary={summary} prevBalTotal={prevBalTotal} />}
        {tab === "detail" && <Detail monthEntries={monthEntries} entries={entries} ym={ym} config={config} cards={cards} onEdit={(e) => { setEditing(e); setSheet(e.cat === "salary" ? "salaryEdit" : e.cat); }} />}
        {tab === "cards" && <Cards cards={cards} debt={debt} ym={ym} onSaveCards={commitCards} onSaveDebt={commitDebt} />}
        {tab === "settings" && <Settings config={config} onSave={commitConfig} entries={entries} cards={cards} debt={debt} theme={theme} onOpenDesign={() => setTab("design")} />}
        {tab === "design" && <ThemeEditor theme={theme} onSave={commitTheme} onBack={() => setTab("settings")} editMode={editMode} onToggleEdit={() => { setEditMode(true); setTab("summary"); }} />}
      </Editable>

      {(tab === "summary" || tab === "detail") && !editMode && <button style={styles.fab} onClick={() => setSheet("pick")}><span style={{ fontSize: 26, marginTop: -2 }}>＋</span></button>}

      {editMode && (
        <div style={styles.editBanner}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>デザイン編集モード：整えたい部分をタップ</span>
          <button style={styles.editDone} onClick={() => { setEditMode(false); setFmtTarget(null); }}>完了</button>
        </div>
      )}

      <nav style={styles.tabs}>
        <TabBtn active={tab === "summary"} onClick={() => setTab("summary")} label="サマリ" icon="◧" />
        <TabBtn active={tab === "detail"} onClick={() => setTab("detail")} label="詳細" icon="≣" />
        <TabBtn active={tab === "cards"} onClick={() => setTab("cards")} label="カード" icon="▤" />
        <TabBtn active={tab === "settings" || tab === "design"} onClick={() => setTab("settings")} label="設定" icon="⚙" />
      </nav>

      {sheet === "pick" && <PickCategory onClose={() => setSheet(null)} onPick={(cat) => { setEditing(null); setSheet(cat); }} />}
      {sheet === "salary" && <SalaryForm key={ym} ym={ym} config={config} entries={entries} onClose={() => { setSheet(null); setEditing(null); }} onSave={(rows) => { replaceSalary(ym, rows); setSheet(null); }} />}
      {sheet === "salaryEdit" && <SalaryEditForm key={editing ? editing.id : "s"} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "card" && <CardForm key={editing ? editing.id : "new-card"} ym={ym} cards={cards} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onAdd={addEntry} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "account" && <AccountForm key={editing ? editing.id : "new-account"} ym={ym} config={config} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onAdd={addEntry} onUpdate={updateEntry} onDelete={removeEntry} />}
      {fmtTarget && <FormatSheet id={fmtTarget} theme={theme} onSave={commitTheme} onClose={() => setFmtTarget(null)} />}
    </div>
    </EditCtx.Provider>
  );
}

function TabBtn({ active, onClick, label, icon }) {
  return <button onClick={onClick} style={{ ...styles.tabBtn, color: active ? "var(--tab-active)" : MUTED }}><span style={{ fontSize: 17 }}>{icon}</span><span style={{ fontSize: 10.5, marginTop: 3, fontWeight: active ? 700 : 500 }}>{label}</span></button>;
}
