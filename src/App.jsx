import React, { useState, useEffect, useMemo } from "react";
import { MUTED, DEFAULT_THEME, themeVars } from './theme.js';
import { ymLabel, uid, addMonth, evalAmount, currentCycleYm, periodLabel, periodRange, migrateEntry, migrateConfig, migratePlan, DEFAULT_CONFIG, acctRole, DEFAULT_CARDS, SEED_ENTRIES, SEED_DEBT, SEED_MEMOS, SEED_SUBS, SEED_PLAN, computeSummary, rollForwardSubs, toggleMonthClosed } from './utils';
import { styles } from './styles.js';
import { Summary } from './components/summary.jsx';
import { Detail } from './components/detail.jsx';
import { CardList } from './components/cards.jsx';
import { Recurring } from './components/recurring.jsx';
import { PlanView } from './components/plan.jsx';
import { Settings, ThemeEditor } from './components/settings.jsx';
import { PickCategory, SalaryForm, SalaryEditForm, CardForm, AccountForm } from './components/forms.jsx';
import { ImportSheet } from './components/import.jsx';
import { Icon } from './icons.jsx';
import { getSyncState, onSyncChange } from './storage.js';

export default function App() {
  const [entries, setEntries] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [cards, setCards] = useState([]);
  const [debt, setDebt] = useState({});
  const [memos, setMemos] = useState([]);
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState(SEED_PLAN);
  const [closedMonths, setClosedMonths] = useState([]);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");
  // 起動時は当月を表示(その月の入力・使いすぎ判定にすぐ入れるように)。矢印で前後の月へ移動できる。
  const [ym, setYm] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [sheet, setSheet] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [e, c, cd, d, th, mm, sb, pl, cm] = await Promise.all([
          window.storage.get("entries", true).catch(() => null),
          window.storage.get("config", true).catch(() => null),
          window.storage.get("cards", true).catch(() => null),
          window.storage.get("debt", true).catch(() => null),
          window.storage.get("theme", true).catch(() => null),
          window.storage.get("memos", true).catch(() => null),
          window.storage.get("subs", true).catch(() => null),
          window.storage.get("plans", true).catch(() => null),
          window.storage.get("closedMonths", true).catch(() => null),
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
        const loadedConfig = migrateConfig(c && c.value ? { ...DEFAULT_CONFIG, ...JSON.parse(c.value) } : DEFAULT_CONFIG);
        setConfig(loadedConfig);
        // 締め日(サイクル)設定があれば、起動時は「今の周期」を表示する
        setYm(currentCycleYm(loadedConfig.cycleCutoffDay));
        const rawCards = cd && cd.value ? JSON.parse(cd.value) : null;
        setCards(Array.isArray(rawCards) && rawCards.length ? rawCards.map((c) => typeof c === "string" ? { id: uid(), name: c, brand: "", note: "", annualFee: 0 } : { id: c.id || uid(), name: c.name || "", brand: c.brand || "", note: c.note || "", annualFee: Number(c.annualFee) || 0 }) : DEFAULT_CARDS);
        const rawDebt = d && d.value ? JSON.parse(d.value) : null;
        setDebt(rawDebt && typeof rawDebt === "object" ? rawDebt : SEED_DEBT);
        setTheme(th && th.value ? { ...DEFAULT_THEME, ...JSON.parse(th.value) } : DEFAULT_THEME);
        const rawMemos = mm && mm.value ? JSON.parse(mm.value) : null;
        setMemos(Array.isArray(rawMemos) ? rawMemos : SEED_MEMOS);
        const rawSubs = sb && sb.value ? JSON.parse(sb.value) : null;
        const loadedSubs = Array.isArray(rawSubs) ? rawSubs : SEED_SUBS;
        const rolledSubs = rollForwardSubs(loadedSubs);
        setSubs(rolledSubs);
        // 更新日を過ぎたサブスクを自動で繰り越した場合はそのまま保存(次回起動時も同じ結果に)
        if (rolledSubs !== loadedSubs) { try { window.storage.set("subs", JSON.stringify(rolledSubs), true); } catch {} }
        const rawPlans = pl && pl.value ? JSON.parse(pl.value) : null;
        // 旧形式(カード別・口座フロー別)の計画は、簡素化モデル(収入/変動費/投資)へ移行する。
        // 固定費の算出に定期費(subs)を使うため、移行にはこの時点の subs を渡す。
        const loadedPlan = rawPlans && rawPlans.lines ? migratePlan(rawPlans, rolledSubs) : SEED_PLAN;
        setPlans(loadedPlan);
        if (rawPlans && rawPlans.lines && loadedPlan !== rawPlans) { try { window.storage.set("plans", JSON.stringify(loadedPlan), true); } catch {} }
        const rawClosed = cm && cm.value ? JSON.parse(cm.value) : null;
        setClosedMonths(Array.isArray(rawClosed) ? rawClosed : []);
      } catch {
        setEntries(SEED_ENTRIES.map((x) => ({ ...x, id: uid() }))); setCards(DEFAULT_CARDS); setDebt(SEED_DEBT);
      } finally { setLoaded(true); }
    })();
  }, []);

  // バックグラウンド同期で別端末の更新を取り込んだら、古いReact状態を残さず再読込する。
  // 古い画面のまま編集してクラウドを巻き戻す事故を防ぐ。
  useEffect(() => {
    const applyRemoteUpdate = () => window.location.reload();
    window.addEventListener("kakeibo:remote-update", applyRemoteUpdate);
    return () => window.removeEventListener("kakeibo:remote-update", applyRemoteUpdate);
  }, []);

  const save = (k, v) => { try { window.storage.set(k, JSON.stringify(v), true); } catch (e) { console.error(e); } };
  const commitConfig = (n) => { setConfig(n); save("config", n); };
  // カード名は entries/debt/plans/subs/memos が文字列で参照しているため、
  // 名前を変えたときは同じidのカードを比較して旧名→新名へ一括で追従させる(参照が迷子にならないように)
  const commitCards = (n) => {
    const renames = n
      .map((c) => { const old = cards.find((x) => x.id === c.id); return old && old.name !== c.name ? { oldName: old.name, newName: c.name } : null; })
      .filter(Boolean);
    if (renames.length > 0) {
      const renameOf = (name) => { const r = renames.find((r) => r.oldName === name); return r ? r.newName : name; };
      setEntries((prev) => { const u = prev.map((e) => (e.cat === "card" && renames.some((r) => r.oldName === e.item) ? { ...e, item: renameOf(e.item) } : e)); save("entries", u); return u; });
      setDebt((prev) => { const nd = { ...prev }; for (const r of renames) { if (nd[r.oldName]) { nd[r.newName] = { ...(nd[r.newName] || {}), ...nd[r.oldName] }; delete nd[r.oldName]; } } save("debt", nd); return nd; });
      setPlans((prev) => { const nl = { ...(prev.lines || {}) }; for (const r of renames) { const ok = "card|" + r.oldName, nk = "card|" + r.newName; if (nl[ok]) { nl[nk] = nl[ok]; delete nl[ok]; } } const np = { ...prev, lines: nl }; save("plans", np); return np; });
      setSubs((prev) => { const u = prev.map((s) => (renames.some((r) => r.oldName === s.card) ? { ...s, card: renameOf(s.card) } : s)); save("subs", u); return u; });
      setMemos((prev) => { const u = prev.map((m) => (renames.some((r) => r.oldName === m.linkedCard) ? { ...m, linkedCard: renameOf(m.linkedCard) } : m)); save("memos", u); return u; });
    }
    setCards(n); save("cards", n);
  };
  const commitDebt = (n) => { setDebt(n); save("debt", n); };
  const commitMemos = (n) => { setMemos(n); save("memos", n); };
  const commitSubs = (n) => { setSubs(n); save("subs", n); };
  const commitPlans = (n) => { setPlans(n); save("plans", n); };
  const toggleClosedMonth = (targetYm) => { const n = toggleMonthClosed(closedMonths, targetYm); setClosedMonths(n); save("closedMonths", n); };

  // バックアップJSONからの復元。読み込み時と同じ移行・正規化を通して安全に取り込む
  const importData = (d) => {
    if (Array.isArray(d.entries)) { const m = d.entries.map(migrateEntry).filter(Boolean); setEntries(m); save("entries", m); }
    if (d.config && typeof d.config === "object") commitConfig(migrateConfig({ ...DEFAULT_CONFIG, ...d.config }));
    if (Array.isArray(d.cards)) commitCards(d.cards.map((c) => typeof c === "string" ? { id: uid(), name: c, brand: "", note: "", annualFee: 0 } : { id: c.id || uid(), name: c.name || "", brand: c.brand || "", note: c.note || "", annualFee: Number(c.annualFee) || 0 }));
    if (d.debt && typeof d.debt === "object") commitDebt(d.debt);
    if (Array.isArray(d.memos)) commitMemos(d.memos);
    if (Array.isArray(d.subs)) commitSubs(d.subs);
    if (d.plans && d.plans.lines) commitPlans(migratePlan(d.plans, Array.isArray(d.subs) ? d.subs : subs));
    if (Array.isArray(d.closedMonths)) { setClosedMonths(d.closedMonths); save("closedMonths", d.closedMonths); }
    if (d.theme && typeof d.theme === "object") commitTheme({ ...DEFAULT_THEME, ...d.theme });
  };
  const commitTheme = (n) => { setTheme(n); save("theme", n); };

  const addEntry = (e) => { const w = { ...e, id: uid() }; setEntries((prev) => { const n = [...prev, w]; save("entries", n); return n; }); return w; };
  // スクショ取込でまとめて追加する時用。1件ずつではなく一括で保存する
  const addEntries = (list) => setEntries((prev) => { const n = [...prev, ...list.map((e) => ({ ...e, id: uid() }))]; save("entries", n); return n; });
  const commitImportRules = (rules) => commitConfig({ ...config, importRules: rules });
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
    // サブスクの支払いカード・メモの紐づけも、カード削除に合わせて外す(参照先が無いまま残らないように)
    if (subs.some((s) => s.card === card.name)) commitSubs(subs.map((s) => (s.card === card.name ? { ...s, card: "" } : s)));
    if (memos.some((m) => m.linkedCard === card.name)) commitMemos(memos.map((m) => (m.linkedCard === card.name ? { ...m, linkedCard: "" } : m)));
    if (plans && plans.lines && plans.lines["card|" + card.name]) { const nl = { ...plans.lines }; delete nl["card|" + card.name]; commitPlans({ ...plans, lines: nl }); }
  };
  const removeConfigItem = (key, name) => {
    if (key === "memoCategories") { commitConfig({ ...config, memoCategories: (config.memoCategories || []).filter((x) => x !== name) }); return; }
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
      const added = rows.filter((r) => evalAmount(r.amount) != null)
        .map((r) => { const v = Math.round(evalAmount(r.amount) || 0); return { id: uid(), ym: targetYm, cat: "salary", item: r.item, account: "", amount: r.item === "控除" ? -Math.abs(v) : v }; });
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
        <div style={styles.brandRow}><span style={styles.brand}>家計簿</span><CloudBadge /></div>
        {(tab === "today" || tab === "records" || tab === "plan") && (
          <div style={styles.monthPicker}>
            <button style={styles.monthArrow} onClick={() => setYm(addMonth(ym, -1))}>‹</button>
            <select value={ym} onChange={(e) => setYm(e.target.value)} style={styles.monthSelect}>{months.map((m) => <option key={m} value={m}>{periodLabel(m, config.cycleCutoffDay)}</option>)}</select>
            <button style={styles.monthArrow} onClick={() => setYm(addMonth(ym, 1))}>›</button>
          </div>
        )}
        {(tab === "today" || tab === "records" || tab === "plan") && periodRange(ym, config.cycleCutoffDay) && (
          <div style={{ textAlign: "center", fontSize: 11, color: MUTED, marginTop: 2 }}>{periodRange(ym, config.cycleCutoffDay)}</div>
        )}
      </header>

      <main style={{ ...styles.main, ...((tab === "today" || tab === "records") ? { paddingBottom: 96 } : {}) }}>
        {tab === "today" && <Summary summary={summary} prevBalTotal={prevBalTotal} plans={plans} subs={subs} config={config} cards={cards} debt={debt} memos={memos} monthEntries={monthEntries} entries={entries} closedMonths={closedMonths} ym={ym} onOpenPlan={() => setTab("plan")} />}
        {tab === "records" && <Detail monthEntries={monthEntries} entries={entries} ym={ym} config={config} cards={cards} memos={memos} onSaveMemos={commitMemos} onEdit={(e) => { setEditing(e); setSheet(e.cat === "salary" ? "salaryEdit" : e.cat); }} />}
        {tab === "plan" && <PlanView plans={plans} onSave={commitPlans} subs={subs} entries={entries} ym={ym} closedMonths={closedMonths} onToggleClosedMonth={toggleClosedMonth} />}
        {tab === "recurring" && <Recurring subs={subs} onSaveSubs={commitSubs} cards={cards} debt={debt} ym={ym} onSaveDebt={commitDebt} />}
        {tab === "settings" && <Settings config={config} onSave={commitConfig} entries={entries} cards={cards} debt={debt} memos={memos} subs={subs} plans={plans} closedMonths={closedMonths} theme={theme} onImport={importData} onOpenDesign={() => setTab("design")} onOpenCards={() => setTab("cards")} onRemoveItem={removeConfigItem} />}
        {tab === "design" && <ThemeEditor theme={theme} onSave={commitTheme} onBack={() => setTab("settings")} />}
        {tab === "cards" && <SubScreen title="カード管理" onBack={() => setTab("settings")}><CardList cards={cards} onSaveCards={commitCards} onRemoveCard={removeCard} /></SubScreen>}
      </main>

      {(tab === "today" || tab === "records") && <button style={styles.fab} onClick={() => setSheet("pick")}><span style={{ fontSize: 26, marginTop: -2 }}>＋</span></button>}

      <nav style={styles.tabs}>
        <TabBtn active={tab === "today"} onClick={() => setTab("today")} label="今月" icon="summary" />
        <TabBtn active={tab === "records"} onClick={() => setTab("records")} label="記録" icon="detail" />
        <TabBtn active={tab === "plan"} onClick={() => setTab("plan")} label="計画" icon="plan" />
        <TabBtn active={tab === "recurring"} onClick={() => setTab("recurring")} label="定期費" icon="recurring" />
        <TabBtn active={tab === "settings" || tab === "design" || tab === "cards"} onClick={() => setTab("settings")} label="設定" icon="settings" />
      </nav>

      {sheet === "pick" && <PickCategory onClose={() => setSheet(null)} onPick={(cat) => { setEditing(null); setSheet(cat); }} />}
      {sheet === "salary" && <SalaryForm key={ym} ym={ym} config={config} entries={entries} onClose={() => { setSheet(null); setEditing(null); }} onSave={(rows) => { replaceSalary(ym, rows); setSheet(null); }} />}
      {sheet === "salaryEdit" && <SalaryEditForm key={editing ? editing.id : "s"} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "card" && <CardForm key={editing ? editing.id : "new-card"} ym={ym} cards={cards} entries={entries} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onAdd={addEntry} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "account" && <AccountForm key={editing ? editing.id : "new-account"} ym={ym} config={config} entries={entries} editing={editing} onClose={() => { setSheet(null); setEditing(null); }} onAdd={addEntry} onUpdate={updateEntry} onDelete={removeEntry} />}
      {sheet === "import" && <ImportSheet cards={cards} config={config} ym={ym} onAddEntries={addEntries} onSaveImportRules={commitImportRules} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ヘッダーの同期状態表示。ログイン中のみ「☁ 同期中」、それ以外は「ローカル保存」
function CloudBadge() {
  const [state, setState] = useState({ mode: "off", status: "idle" });
  useEffect(() => {
    const refresh = () => getSyncState().then(setState).catch(() => {});
    refresh();
    return onSyncChange(refresh);
  }, []);
  const label = state.mode !== "on" ? "ローカル保存" : state.status === "syncing" ? "☁ 同期中…" : state.status === "error" ? "⚠ 同期エラー" : "☁ 同期済み";
  return <span style={{ ...styles.cloud, color: state.status === "error" ? "var(--expense)" : undefined }}>{label}</span>;
}

// 設定から開くサブ画面(カード管理・メモ)の共通の器。戻る導線を上に付ける。
function SubScreen({ title, onBack, children }) {
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <button style={styles.backLink} onClick={onBack}>‹ 設定にもどる</button>
      <div style={{ fontSize: 15, fontWeight: 700, margin: "2px 4px 12px" }}>{title}</div>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, label, icon }) {
  return <button onClick={onClick} style={{ ...styles.tabBtn, color: active ? "var(--tab-active)" : MUTED }}><Icon name={icon} size={22} strokeWidth={active ? 2.1 : 1.8} /><span style={{ fontSize: 10.5, marginTop: 3, fontWeight: active ? 700 : 500 }}>{label}</span></button>;
}
