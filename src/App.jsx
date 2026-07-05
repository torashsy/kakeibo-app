import React, { useState, useEffect, useMemo, createContext, useContext } from "react";

// 編集モードのコンテキスト(要素タップで書式編集)
const EditCtx = createContext({ editMode: false, overrides: {}, pick: () => {} });
// 編集可能な要素をラップ: overrideを適用し、編集モードならタップで書式編集
function Editable({ id, base, tag = "div", children, ...rest }) {
  const { editMode, overrides, pick } = useContext(EditCtx);
  const merged = { ...base, ...ovStyle(overrides[id]) };
  const isContainer = CONTAINER_IDS.has(id);
  const style = editMode ? { ...merged, ...EDIT_OUTLINE, ...(isContainer ? { position: "relative" } : {}) } : merged;
  const onClick = editMode ? (e) => { e.stopPropagation(); e.preventDefault(); pick(id); } : rest.onClick;
  const Tag = tag;
  if (editMode && isContainer) {
    return <Tag {...rest} style={style} onClick={onClick}>
      <span onClick={(e) => { e.stopPropagation(); pick(id); }} style={styles.ovChip}>◧ {TARGET_LABELS[id] || "背景"}</span>
      {children}
    </Tag>;
  }
  return <Tag {...rest} style={style} onClick={onClick}>{children}</Tag>;
}

// 家計簿Webアプリ v2
// 入力3カテゴリ: 給与系 / カード / 口座、連続追加、カード残債・一覧(編集可)
// データは window.storage でクラウド保存(スマホ・PC共有)

// 色はCSS変数を参照(テーマで差し替え可能)。フォールバック値も持たせる。
const ACCENT = "var(--accent)", ACCENT_SOFT = "var(--accent-soft)", INK = "var(--ink)", PAPER = "var(--paper)";
const LINE = "var(--line)", MUTED = "var(--muted)", RED = "var(--expense)", GREEN = "var(--income)";

// ユーザーが細かく調整できるデザイン設定
const FONT_CHOICES = [
  { id: "gothic", label: "ゴシック", stack: "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif" },
  { id: "mincho", label: "明朝", stack: "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif" },
  { id: "maru", label: "丸ゴシック", stack: "'Hiragino Maru Gothic ProN','Rounded Mplus 1c',sans-serif" },
  { id: "system", label: "システム", stack: "system-ui,-apple-system,sans-serif" },
  { id: "mono", label: "等幅", stack: "'SF Mono','Consolas',monospace" },
];
const fontStack = (id) => (FONT_CHOICES.find((f) => f.id === id) || FONT_CHOICES[0]).stack;

const DEFAULT_THEME = {
  accent: "#2F6F5B", accentSoft: "#E6F0EC", ink: "#1C2321", paper: "#FBFAF7",
  line: "#E4E1D9", muted: "#8A8577", income: "#2F6F5B", expense: "#B5462F",
  cardBg: "#FFFFFF",
  thBg: "#F7F5EF", groupBg: "#EDEAE2", acctBg: "#F1F5F3", subtotalBg: "#F4F1EA", totalCellBg: "#FAF9F5",
  numAlign: "right", labelAlign: "left",
  radius: 14, rowPad: 12, numSize: 15,
  heroBg: "#2F6F5B", heroText: "#FFFFFF",
  font: "gothic", numFont: "gothic", baseSize: 15, heavy: 800, tracking: 0,
  tabBg: "#FFFFFF", tabActive: "#2F6F5B",
  tabularNums: true,
  overrides: {},  // 要素別の書式上書き { targetId: {align,color,size,weight,bg} }
};

// 要素別オーバーライドをCSSに変換
const ovStyle = (ov) => {
  if (!ov) return {};
  const s = {};
  if (ov.align) s.textAlign = ov.align;
  if (ov.color) s.color = ov.color;
  if (ov.size) s.fontSize = ov.size + "px";
  if (ov.weight) s.fontWeight = ov.weight;
  if (ov.bg) s.background = ov.bg;
  if (ov.justify) s.justifyContent = ov.justify;
  if (ov.radius != null) s.borderRadius = ov.radius + "px";
  if (ov.pad != null) s.padding = ov.pad + "px";
  if (ov.tracking != null) s.letterSpacing = ov.tracking + "px";
  if (ov.borderColor) s.border = `${ov.borderWidth != null ? ov.borderWidth : 1}px solid ${ov.borderColor}`;
  return s;
};
// 編集モードで要素を囲む点線
const EDIT_OUTLINE = { outline: "1.5px dashed #B58B4F", outlineOffset: 1, cursor: "pointer", borderRadius: 4 };
// 子要素で覆われるコンテナは、角のチップから選べるようにする
const CONTAINER_IDS = new Set(["hero.bg", "sum.bg", "card.bg", "app.bg"]);
const themeVars = (t) => ({
  "--accent": t.accent, "--accent-soft": t.accentSoft, "--ink": t.ink, "--paper": t.paper,
  "--line": t.line, "--muted": t.muted, "--income": t.income, "--expense": t.expense,
  "--card-bg": t.cardBg, "--th-bg": t.thBg, "--group-bg": t.groupBg, "--acct-bg": t.acctBg,
  "--subtotal-bg": t.subtotalBg, "--total-cell-bg": t.totalCellBg,
  "--num-align": t.numAlign, "--label-align": t.labelAlign,
  "--radius": t.radius + "px", "--row-pad": t.rowPad + "px", "--num-size": t.numSize + "px",
  "--hero-bg": t.heroBg, "--hero-text": t.heroText,
  "--font": fontStack(t.font), "--num-font": fontStack(t.numFont),
  "--base-size": (t.baseSize || 15) + "px", "--heavy": t.heavy, "--tracking": (t.tracking || 0) + "px",
  "--tab-bg": t.tabBg, "--tab-active": t.tabActive,
  "--num-variant": t.tabularNums ? "tabular-nums" : "normal",
});

const yen = (n) => (n < 0 ? "-" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");
const num = (n) => (n == null ? "" : Math.round(n).toLocaleString("ja-JP"));
const ymLabel = (ym) => { const [y, m] = ym.split("-"); return `${y}年${parseInt(m, 10)}月`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const addMonth = (ym, d) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };

// 旧バージョン(kindベース)のデータを新形式(catベース)に変換して救済する
function migrateEntry(e) {
  if (!e || typeof e !== "object") return null;
  const id = e.id || uid();
  // すでに新形式でも、臨時収入が給与系に紛れていたら口座の受取へ移す
  if (e.cat) {
    if (e.cat === "salary" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "受取", account: e.account || "", amount: Math.abs(e.amount) };
    return { ...e, id };
  }
  // 旧形式: kind = income/deduction/expense/card/transfer/balance
  const k = e.kind;
  if (k === "income" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "受取", account: e.account || "", amount: Math.abs(e.amount) };
  if (k === "salary" || k === "income") return { id, ym: e.ym, cat: "salary", item: e.item || "給与", account: "", amount: e.amount };
  if (k === "deduction") return { id, ym: e.ym, cat: "salary", item: "控除", account: "", amount: -Math.abs(e.amount) };
  if (k === "card") return { id, ym: e.ym, cat: "card", item: e.item, account: "", amount: Math.abs(e.amount) };
  if (k === "balance") return { id, ym: e.ym, cat: "account", item: "残高", account: e.account || "", amount: e.amount };
  if (k === "expense") return { id, ym: e.ym, cat: "account", item: "引出", account: e.account || "", amount: -Math.abs(e.amount) };
  if (k === "transfer") return { id, ym: e.ym, cat: "account", item: e.amount >= 0 ? "受取" : "引出", account: e.account || "", amount: e.amount };
  // 判別不能なものは無視(壊れたデータで落ちないように)
  return null;
}

const DEFAULT_CONFIG = { accounts: ["ゆうちょ", "住信SBI", "JRE BANK"], salaryItems: ["給与", "手当", "賞与", "控除"] };

// 口座記録の種類。role: bal=残高記録 / in=収入に算入 / out=支出に算入 / transfer=符号そのまま収支に算入
const ACCOUNT_TYPES = [
  { id: "残高", role: "bal", hint: "口座の残高を記録します" },
  { id: "預入", role: "in", hint: "口座への預け入れ。収入に入ります" },
  { id: "引出", role: "out", hint: "口座からの引き出し。支出に入ります" },
  { id: "受取", role: "in", hint: "送金などの受け取り。収入に入ります" },
  { id: "送金", role: "out", hint: "他所への送金。支出に入ります" },
  { id: "投資振替", role: "transfer", hint: "投資/ハイブリッド口座への振替。入れた分は支出、戻した分は収入" },
];
const acctRole = (item) => (ACCOUNT_TYPES.find((t) => t.id === item)?.role) || (item === "入金" || item === "現金預入" || item === "送金受取" ? "in" : item === "出金" || item === "現金引出" ? "out" : item === "残高" ? "bal" : "out");

const DEFAULT_CARDS = [
  { id: uid(), name: "SMCC Gold", brand: "VISA", note: "三井住友ゴールドNL" },
  { id: uid(), name: "smcc", brand: "VISA", note: "三井住友NL" },
  { id: uid(), name: "JAL navi", brand: "JCB", note: "JALカードNavi" },
  { id: uid(), name: "VIEW", brand: "VISA", note: "ビューゴールド" },
  { id: uid(), name: "JCB Gold", brand: "JCB", note: "" },
  { id: uid(), name: "SAISON", brand: "AMEX", note: "セゾン" },
  { id: uid(), name: "EPOS", brand: "VISA", note: "エポス" },
  { id: uid(), name: "TOBU", brand: "VISA", note: "東武" },
  { id: uid(), name: "PayPay", brand: "JCB", note: "PayPayカード" },
  { id: uid(), name: "MDC", brand: "VISA", note: "大丸松坂屋" },
];

const SEED_ENTRIES = [
  { ym: "2026-04", cat: "account", item: "残高", account: "ゆうちょ", amount: 48924 },
  { ym: "2026-04", cat: "account", item: "残高", account: "住信SBI", amount: 47495 },
  { ym: "2026-04", cat: "account", item: "残高", account: "JRE BANK", amount: 1199 },
  { ym: "2026-05", cat: "salary", item: "給与", account: "", amount: 286720 },
  { ym: "2026-05", cat: "salary", item: "手当", account: "", amount: 2068 },
  { ym: "2026-05", cat: "salary", item: "控除", account: "", amount: -49953 },
  { ym: "2026-05", cat: "card", item: "SMCC Gold", account: "", amount: 66065 },
  { ym: "2026-05", cat: "card", item: "smcc", account: "", amount: 294 },
  { ym: "2026-05", cat: "card", item: "JAL navi", account: "", amount: 51943 },
  { ym: "2026-05", cat: "card", item: "VIEW", account: "", amount: 143560 },
  { ym: "2026-05", cat: "card", item: "SAISON", account: "", amount: 135270 },
  { ym: "2026-05", cat: "card", item: "PayPay", account: "", amount: 19550 },
  { ym: "2026-05", cat: "card", item: "MDC", account: "", amount: 2025 },
  { ym: "2026-05", cat: "account", item: "残高", account: "ゆうちょ", amount: 18503 },
  { ym: "2026-05", cat: "account", item: "受取", account: "ゆうちょ", amount: 52563 },
  { ym: "2026-05", cat: "account", item: "引出", account: "ゆうちょ", amount: -6165 },
  { ym: "2026-05", cat: "account", item: "残高", account: "住信SBI", amount: 5296 },
  { ym: "2026-05", cat: "account", item: "受取", account: "住信SBI", amount: 63172 },
  { ym: "2026-05", cat: "account", item: "残高", account: "JRE BANK", amount: 20399 },
  { ym: "2026-05", cat: "account", item: "受取", account: "JRE BANK", amount: 19760 },
  { ym: "2026-06", cat: "salary", item: "給与", account: "", amount: 286720 },
  { ym: "2026-06", cat: "salary", item: "手当", account: "", amount: 4136 },
  { ym: "2026-06", cat: "salary", item: "賞与", account: "", amount: 134073 },
  { ym: "2026-06", cat: "salary", item: "控除", account: "", amount: -50034 },
  { ym: "2026-06", cat: "card", item: "SMCC Gold", account: "", amount: 97508 },
  { ym: "2026-06", cat: "card", item: "smcc", account: "", amount: 294 },
  { ym: "2026-06", cat: "card", item: "EPOS", account: "", amount: 15322 },
  { ym: "2026-06", cat: "card", item: "PayPay", account: "", amount: 5314 },
  { ym: "2026-06", cat: "account", item: "残高", account: "ゆうちょ", amount: 155596 },
  { ym: "2026-06", cat: "account", item: "残高", account: "住信SBI", amount: 5660 },
  { ym: "2026-06", cat: "account", item: "引出", account: "住信SBI", amount: -25000 },
  { ym: "2026-06", cat: "account", item: "投資振替", account: "住信SBI", amount: -94000 },
  { ym: "2026-06", cat: "account", item: "残高", account: "JRE BANK", amount: 20399 },
];

const SEED_DEBT = {
  "SMCC Gold": { "2026-06": 55140, "2026-07": 54804, "2026-08": 47975, "2026-09": 44041, "2026-10": 37845, "2026-11": 34866, "2026-12": 34480 },
  "smcc": { "2026-06": 294, "2026-07": 294, "2026-08": 294 },
  "JAL navi": { "2026-06": 37284, "2026-07": 37284, "2026-08": 4740 },
  "VIEW": { "2026-06": 37100 },
};

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

// 選択した要素の書式を編集するシート
function FormatSheet({ id, theme, onSave, onClose }) {
  const ov = (theme.overrides && theme.overrides[id]) || {};
  const setOv = (patch) => {
    const next = { ...ov, ...patch };
    Object.keys(next).forEach((k) => { if (next[k] === "" || next[k] == null) delete next[k]; });
    onSave({ ...theme, overrides: { ...(theme.overrides || {}), [id]: next } });
  };
  const label = TARGET_LABELS[id] || "この要素";
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{label}の書式</div>

        <label style={styles.fieldLabel}>文字の揃え</label>
        <div style={styles.kindRow}>
          {[["", "既定"], ["left", "左"], ["center", "中央"], ["right", "右"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.kindBtn, ...((ov.align || "") === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : {}) }} onClick={() => setOv({ align: v })}>{l}</button>
          ))}
        </div>

        <label style={styles.fieldLabel}>太さ</label>
        <div style={styles.kindRow}>
          {[["", "既定"], [400, "細"], [600, "中"], [700, "太"], [800, "極太"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.kindBtn, ...((ov.weight || "") === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : {}) }} onClick={() => setOv({ weight: v })}>{l}</button>
          ))}
        </div>

        <div style={styles.fmtGrid}>
          <div>
            <label style={styles.fieldLabel}>文字サイズ</label>
            <div style={styles.fmtCell}>
              <input type="range" min={10} max={40} value={ov.size || 15} onChange={(e) => setOv({ size: parseInt(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} />
              <span style={{ fontSize: 12, color: MUTED, width: 34, textAlign: "right" }}>{ov.size || "既定"}</span>
            </div>
          </div>
        </div>

        <div style={styles.fmtGrid}>
          <div style={{ flex: 1 }}>
            <label style={styles.fieldLabel}>角丸</label>
            <div style={styles.fmtCell}><input type="range" min={0} max={30} value={ov.radius != null ? ov.radius : 0} onChange={(e) => setOv({ radius: parseInt(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} /><span style={{ fontSize: 11, color: MUTED, width: 30, textAlign: "right" }}>{ov.radius != null ? ov.radius : "既定"}</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.fieldLabel}>余白</label>
            <div style={styles.fmtCell}><input type="range" min={0} max={30} value={ov.pad != null ? ov.pad : 8} onChange={(e) => setOv({ pad: parseInt(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} /><span style={{ fontSize: 11, color: MUTED, width: 30, textAlign: "right" }}>{ov.pad != null ? ov.pad : "既定"}</span></div>
          </div>
        </div>

        <label style={styles.fieldLabel}>字間</label>
        <div style={styles.fmtCell}><input type="range" min={-1} max={4} step={0.1} value={ov.tracking != null ? ov.tracking : 0} onChange={(e) => setOv({ tracking: parseFloat(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} /><span style={{ fontSize: 11, color: MUTED, width: 34, textAlign: "right" }}>{ov.tracking != null ? ov.tracking : "既定"}</span></div>

        <div style={styles.fmtGrid}>
          <div>
            <label style={styles.fieldLabel}>文字色</label>
            <div style={styles.fmtCell}><input type="color" value={ov.color || "#1C2321"} onChange={(e) => setOv({ color: e.target.value })} style={styles.colorInput} /><button style={styles.miniClear} onClick={() => setOv({ color: "" })}>既定</button></div>
          </div>
          <div>
            <label style={styles.fieldLabel}>背景色</label>
            <div style={styles.fmtCell}><input type="color" value={ov.bg || "#FFFFFF"} onChange={(e) => setOv({ bg: e.target.value })} style={styles.colorInput} /><button style={styles.miniClear} onClick={() => setOv({ bg: "" })}>既定</button></div>
          </div>
          <div>
            <label style={styles.fieldLabel}>罫線色</label>
            <div style={styles.fmtCell}><input type="color" value={ov.borderColor || "#E4E1D9"} onChange={(e) => setOv({ borderColor: e.target.value })} style={styles.colorInput} /><button style={styles.miniClear} onClick={() => setOv({ borderColor: "", borderWidth: "" })}>既定</button></div>
          </div>
        </div>

        <button style={styles.deleteBtn} onClick={() => { const o = { ...(theme.overrides || {}) }; delete o[id]; onSave({ ...theme, overrides: o }); onClose(); }}>この要素の書式をリセット</button>
        <button style={styles.saveBtn} onClick={onClose}>完了</button>
      </div>
    </div>
  );
}

const TARGET_LABELS = {
  "hero.bg": "サマリ上部の背景", "sum.bg": "集計セルの背景", "card.bg": "残高カードの背景",
  "bal.row": "残高の行", "app.bg": "全体の背景", "card.acctHead": "口座の見出し", "card.groupHead": "グループ見出し",
  "table.th": "表の見出し", "table.group": "表のグループ見出し", "table.acct": "表の口座見出し",
  "table.subtotal": "表の小計", "table.rowlabel": "表の項目名", "table.cell": "表の数値セル", "table.totalcell": "表の合計セル",
  "hero.value": "収支の金額", "hero.label": "「今月の収支」見出し", "hero.sub": "収支の内訳",
  "sum.cell": "サマリの4セル", "bal.row": "残高の行", "sec.title": "見出し",
  "detail.item": "項目名", "detail.total": "項目の金額", "detail.subtotal": "小計行",
  "table.th": "表の見出し", "table.group": "表のグループ見出し", "themeSection": "見出し",
};

function Summary({ summary, prevBalTotal }) {
  const hasBal = Object.keys(summary.balances).length > 0;
  const balChange = (hasBal && prevBalTotal != null) ? summary.balTotal - prevBalTotal : null;
  return (
    <div style={{ padding: "4px 2px" }}>
      <Editable id="hero.bg" base={styles.heroCard}>
        <Editable id="hero.label" base={styles.heroLabel}>今月の収支</Editable>
        <Editable id="hero.value" base={{ ...styles.heroValue, color: summary.net >= 0 ? "#fff" : "#FFD9CF" }}>{yen(summary.net)}</Editable>
        <Editable id="hero.sub" base={styles.heroSub}>収入 {yen(summary.income)}　−　支出 {yen(summary.expense)}</Editable>
      </Editable>
      <div style={styles.sumGrid}>
        <SumCell label="給与(手取り)" value={summary.gross + summary.deduction} color={GREEN} />
        <SumCell label="カード請求" value={-summary.cardTotal} color={RED} />
        <SumCell label="入金(現金・送金)" value={summary.cashIn} color={GREEN} />
        <SumCell label="出金(現金・送金)" value={-summary.cashOut} color={RED} />
      </div>
      <Editable id="sec.title" base={styles.sectionTitle}>口座残高</Editable>
      <Editable id="card.bg" base={styles.balCard}>
        {!hasBal && <div style={{ color: MUTED, fontSize: 13, padding: "6px 2px" }}>この月の残高記録はまだありません</div>}
        {Object.entries(summary.balances).map(([acc, v]) => <Editable key={acc} id="bal.row" base={styles.balRow}><span style={styles.balAcc}>{acc}</span><span style={styles.balVal}>{yen(v)}</span></Editable>)}
        {hasBal && <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}><span style={{ ...styles.balAcc, fontWeight: 700 }}>合計</span><span style={{ ...styles.balVal, fontWeight: 700 }}>{yen(summary.balTotal)}</span></div>}
        {balChange != null && <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>前月からの増減</span><span style={{ ...styles.balVal, color: balChange >= 0 ? GREEN : RED, fontSize: 14 }}>{yen(balChange)}</span></div>}
      </Editable>
      {balChange != null && (() => {
        const diff = balChange - summary.net;
        const ok = Math.abs(diff) < 1;
        return (
          <div style={{ ...styles.checkCard, background: ok ? ACCENT_SOFT : "#FBEEE9" }}>
            {ok ? <span style={{ color: ACCENT, fontSize: 12.5 }}>✓ 残高の増減と収支が一致しています</span>
              : <span style={{ color: RED, fontSize: 12.5 }}>⚠ 残高増減と収支に {yen(Math.abs(diff))} のズレがあります（入力もれの可能性）</span>}
          </div>
        );
      })()}
    </div>
  );
}
function SumCell({ label, value, color }) {
  return <Editable id="sum.bg" base={styles.sumCell}><div style={styles.sumCellLabel}>{label}</div><Editable id="sum.cell" base={{ ...styles.sumCellValue, color }}>{yen(value)}</Editable></Editable>;
}

// 月データを、元incomeと同じ並びの「項目リスト」に整える(0円項目も含む)
function buildStructure(monthEntries, config, cards) {
  const byKey = {}; // key -> {item, account, cat, entries[]}
  const push = (cat, item, account, e) => {
    const key = cat + "|" + item + "|" + (account || "");
    if (!byKey[key]) byKey[key] = { cat, item, account: account || "", entries: [] };
    if (e) byKey[key].entries.push(e);
  };
  // 先に器を用意(0円でも表示するため)
  (config.salaryItems || []).forEach((it) => push("salary", it, ""));
  (cards || []).forEach((c) => push("card", c.name, ""));
  const accounts = config.accounts || [];
  const flowTypes = ["預入", "受取", "引出", "送金", "投資振替"];
  accounts.forEach((a) => flowTypes.forEach((t) => push("account", t, a)));
  accounts.forEach((a) => push("account", "残高", a));
  // 実データを流し込む(器に無い項目=旧データも動的に追加)
  for (const e of monthEntries) push(e.cat, e.item, e.cat === "account" ? e.account : "", e);
  const totalOf = (key) => byKey[key].entries.reduce((a, e) => a + e.amount, 0);
  const get = (cat, item, account) => byKey[cat + "|" + item + "|" + (account || "")] || { entries: [], cat, item, account: account || "" };
  return { byKey, totalOf, get, accounts, flowTypes };
}

function Detail({ monthEntries, entries, ym, config, cards, onEdit }) {
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

// 履歴: この月の全記録を1件ずつ一覧。タップで編集・削除。
function DetailList({ monthEntries, onEdit }) {
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

// 1項目の行(0円/単一/折りたたみ)を描画。インデント一定。
function ItemRow({ label, node, gkey, open, toggle, onEdit }) {
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

function DetailCards({ S, config, cards, onEdit }) {
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

// 表: 項目別と同じ並び + 小計。行=項目、列=1件目..計。
function DetailTable({ S, config, cards, onEdit }) {
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

// 年間表: 12か月を横に並べて各項目の月次合計を表示
function YearTable({ entries, ym, config, cards }) {
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

function Cards({ cards, debt, ym, onSaveCards, onSaveDebt }) {
  const [view, setView] = useState("debt");
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.viewToggle}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "debt" ? styles.viewToggleActive : {}) }} onClick={() => setView("debt")}>残債</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "list" ? styles.viewToggleActive : {}) }} onClick={() => setView("list")}>カード一覧</button>
      </div>
      {view === "debt" ? <DebtTable cards={cards} debt={debt} ym={ym} onSaveDebt={onSaveDebt} /> : <CardList cards={cards} onSaveCards={onSaveCards} />}
    </div>
  );
}
function DebtTable({ cards, debt, ym, onSaveDebt }) {
  const monthsCols = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonth(ym, i)), [ym]);
  const remaining = (name) => { const s = debt[name] || {}; return Object.entries(s).filter(([m]) => m >= ym).reduce((a, [, v]) => a + (v || 0), 0); };
  const totalRemaining = cards.reduce((a, c) => a + remaining(c.name), 0);
  const [edit, setEdit] = useState(null);
  const openEdit = (name, month) => setEdit({ name, month, value: (debt[name]?.[month] ?? "").toString() });
  const commitEdit = () => {
    const v = edit.value === "" ? null : parseFloat(edit.value);
    const next = { ...debt, [edit.name]: { ...(debt[edit.name] || {}) } };
    if (v == null || isNaN(v) || v === 0) delete next[edit.name][edit.month]; else next[edit.name][edit.month] = v;
    onSaveDebt(next); setEdit(null);
  };
  return (
    <div>
      <div style={styles.debtSummary}><span style={{ fontSize: 13, color: MUTED }}>残債合計（{ymLabel(ym)}以降）</span><span style={{ fontSize: 22, fontWeight: 800, color: RED }}>{yen(totalRemaining)}</span></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>各月の支払予定額。セルをタップで編集。横スクロール可。</div>
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead><tr><th style={{ ...styles.th, ...styles.thSticky }}>カード</th>{monthsCols.map((m) => <th key={m} style={styles.th}>{parseInt(m.split("-")[1], 10)}月</th>)}<th style={{ ...styles.th, ...styles.thTotal }}>残債</th></tr></thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td style={{ ...styles.td, ...styles.tdSticky }}>{c.name}</td>
                {monthsCols.map((m) => <td key={m} style={styles.tdNum}><button style={styles.cellBtn} onClick={() => openEdit(c.name, m)}>{debt[c.name]?.[m] ? num(debt[c.name][m]) : "·"}</button></td>)}
                <td style={{ ...styles.tdNum, ...styles.tdTotalCell }}>{num(remaining(c.name))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.miniSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetTitle}>{edit.name}・{ymLabel(edit.month)}の支払額</div>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} placeholder="0" style={styles.amountInput} autoFocus /></div>
            <button style={styles.saveBtn} onClick={commitEdit}>保存</button>
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
function CardList({ cards, onSaveCards }) {
  const [edit, setEdit] = useState(null);
  const commit = () => {
    if (!edit.name.trim()) return;
    const next = edit.id ? cards.map((c) => (c.id === edit.id ? edit : c)) : [...cards, { ...edit, id: uid() }];
    onSaveCards(next); setEdit(null);
  };
  return (
    <div>
      <div style={styles.detailHead}><span>所有カード（{cards.length}枚）</span><button style={styles.addBtn} onClick={() => setEdit({ name: "", brand: "", note: "" })}>＋ 追加</button></div>
      <div style={styles.detailCard}>
        {cards.map((c) => (
          <button key={c.id} style={styles.cardListRow} onClick={() => setEdit({ ...c })}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</span>
              {c.note && <span style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{c.note}</span>}
            </span>
            <span style={styles.brandTag}>{c.brand || "—"}</span>
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
            <label style={styles.fieldLabel}>メモ（任意）</label>
            <input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="正式名称や用途など" style={styles.textInput} />
            <button style={{ ...styles.saveBtn, opacity: edit.name.trim() ? 1 : 0.4 }} onClick={commit} disabled={!edit.name.trim()}>{edit.id ? "更新する" : "追加する"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={() => { onSaveCards(cards.filter((c) => c.id !== edit.id)); setEdit(null); }}>このカードを削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PickCategory({ onClose, onPick }) {
  const cats = [
    { id: "salary", label: "給与系", desc: "給与・手当・賞与・控除をまとめて", color: GREEN, icon: "¥" },
    { id: "card", label: "カード", desc: "カードの請求額を記録", color: RED, icon: "▤" },
    { id: "account", label: "口座", desc: "入金・出金・残高を記録", color: ACCENT, icon: "◫" },
  ];
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>何を記録しますか？</div>
        {cats.map((c) => (
          <button key={c.id} style={styles.pickRow} onClick={() => onPick(c.id)}>
            <span style={{ ...styles.pickIcon, background: c.color }}>{c.icon}</span>
            <span style={{ textAlign: "left", flex: 1 }}><span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{c.label}</span><span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 2 }}>{c.desc}</span></span>
            <span style={{ color: MUTED, fontSize: 20 }}>›</span>
          </button>
        ))}
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

// 給与系の1件を編集・削除する(項目名は固定、金額のみ変更)
function SalaryEditForm({ editing, onClose, onUpdate, onDelete }) {
  const isDeduction = editing.item === "控除";
  const [amount, setAmount] = useState(Math.abs(editing.amount).toString());
  const canSave = amount && !isNaN(parseFloat(amount));
  const submit = () => {
    if (!canSave) return;
    const v = Math.abs(parseFloat(amount));
    onUpdate({ ...editing, amount: isDeduction ? -v : v });
    onClose();
  };
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{editing.item}を編集（{ymLabel(editing.ym)}）</div>
        <div style={styles.signHint}>{isDeduction ? "控除は手取りから差し引かれます（マイナス不要）" : "金額をプラスで入力"}</div>
        <label style={styles.fieldLabel}>金額</label>
        <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={styles.amountInput} autoFocus /></div>
        <button style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }} onClick={submit} disabled={!canSave}>更新する</button>
        <button style={styles.deleteBtn} onClick={() => { onDelete(editing.id); onClose(); }}>この記録を削除</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

function SalaryForm({ ym, config, entries, onClose, onSave }) {
  const existing = useMemo(() => entries.filter((e) => e.ym === ym && e.cat === "salary"), [entries, ym]);
  const [rows, setRows] = useState(config.salaryItems.map((it) => { const f = existing.find((e) => e.item === it); return { item: it, amount: f ? Math.abs(f.amount).toString() : "" }; }));
  const setAmt = (i, v) => setRows(rows.map((r, idx) => (idx === i ? { ...r, amount: v } : r)));
  const takeHome = rows.reduce((a, r) => { const v = parseFloat(r.amount); if (isNaN(v)) return a; return a + (r.item === "控除" ? -Math.abs(v) : v); }, 0);
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>給与系（{ymLabel(ym)}）</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>金額はプラスで入力。控除は自動で差し引きます。</div>
        {rows.map((r, i) => (
          <div key={r.item} style={styles.salaryRow}>
            <span style={{ fontSize: 14, width: 64, color: r.item === "控除" ? "#7A6A4F" : INK, fontWeight: 600 }}>{r.item}</span>
            <div style={{ ...styles.amountWrap, flex: 1, padding: "5px 12px", border: `1px solid ${LINE}` }}>
              <span style={{ ...styles.yenMark, fontSize: 16 }}>¥</span>
              <input type="number" inputMode="numeric" value={r.amount} onChange={(e) => setAmt(i, e.target.value)} placeholder="0" style={{ ...styles.amountInput, fontSize: 18 }} />
            </div>
          </div>
        ))}
        <div style={styles.takeHomeRow}><span>手取り見込み</span><span style={{ fontWeight: 800, color: GREEN }}>{yen(takeHome)}</span></div>
        <button style={styles.saveBtn} onClick={() => onSave(rows)}>保存する</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

function CardForm({ ym, cards, editing, onClose, onAdd, onUpdate, onDelete }) {
  const [item, setItem] = useState(editing ? editing.item : "");
  const [amount, setAmount] = useState(editing ? Math.abs(editing.amount).toString() : "");
  const [entryYm, setEntryYm] = useState(editing ? editing.ym : ym);
  const [flash, setFlash] = useState("");
  const canSave = item && amount && !isNaN(parseFloat(amount));
  const build = () => ({ id: editing ? editing.id : undefined, ym: entryYm, cat: "card", item, account: "", amount: Math.abs(parseFloat(amount)) });
  const saveOne = (cont) => {
    if (!canSave) return;
    if (editing) { onUpdate({ ...build(), id: editing.id }); onClose(); return; }
    onAdd(build());
    if (cont) { setFlash(`${item} ${yen(Math.abs(parseFloat(amount)))} を追加`); setItem(""); setAmount(""); setTimeout(() => setFlash(""), 1600); } else onClose();
  };
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{editing ? "カード請求を編集" : "カード請求を追加"}</div>
        {flash && <div style={styles.flash}>✓ {flash}</div>}
        <label style={styles.fieldLabel}>カード</label>
        <div style={styles.optionRow}>{cards.map((c) => <button key={c.id} style={{ ...styles.optionChip, ...(item === c.name ? styles.optionChipActive : {}) }} onClick={() => setItem(c.name)}>{c.name}</button>)}</div>
        <label style={styles.fieldLabel}>請求額</label>
        <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={styles.amountInput} autoFocus /></div>
        <label style={styles.fieldLabel}>月</label>
        <input type="month" value={entryYm} onChange={(e) => setEntryYm(e.target.value)} style={styles.textInput} />
        {editing ? (
          <><button style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>更新する</button><button style={styles.deleteBtn} onClick={() => { onDelete(editing.id); onClose(); }}>削除する</button></>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4, background: "#fff", color: ACCENT, border: `1.5px solid ${ACCENT}` }} onClick={() => saveOne(true)} disabled={!canSave}>保存して続ける</button>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>保存して閉じる</button>
          </div>
        )}
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

function AccountForm({ ym, config, editing, onClose, onAdd, onUpdate, onDelete }) {
  const [type, setType] = useState(editing ? editing.item : "残高");
  const [account, setAccount] = useState(editing ? editing.account : (config.accounts[0] || ""));
  const [amount, setAmount] = useState(editing ? Math.abs(editing.amount).toString() : "");
  const [dir, setDir] = useState(editing && editing.amount < 0 ? "out" : "in"); // 投資振替の方向
  const [entryYm, setEntryYm] = useState(editing ? editing.ym : ym);
  const [flash, setFlash] = useState("");
  const isTransfer = acctRole(type) === "transfer";
  const canSave = account && amount && !isNaN(parseFloat(amount));
  const signed = () => {
    const v = Math.abs(parseFloat(amount));
    if (isTransfer) return dir === "out" ? -v : v;   // 入れる=−(支出方向) / 戻す=＋(収入方向)
    return acctRole(type) === "out" ? -v : v;
  };
  const build = () => ({ id: editing ? editing.id : undefined, ym: entryYm, cat: "account", item: type, account, amount: signed() });
  const saveOne = (cont) => {
    if (!canSave) return;
    if (editing) { onUpdate({ ...build(), id: editing.id }); onClose(); return; }
    onAdd(build());
    if (cont) { setFlash(`${account} ${type} ${yen(signed())}`); setAmount(""); setTimeout(() => setFlash(""), 1600); } else onClose();
  };
  const hint = ACCOUNT_TYPES.find((t) => t.id === type)?.hint || "";
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{editing ? "口座の記録を編集" : "口座の記録を追加"}</div>
        {flash && <div style={styles.flash}>✓ {flash}</div>}
        <label style={styles.fieldLabel}>種類</label>
        <div style={styles.typeRow}>{ACCOUNT_TYPES.map((t) => <button key={t.id} style={{ ...styles.typeChip, ...(type === t.id ? styles.optionChipActive : {}) }} onClick={() => setType(t.id)}>{t.id}</button>)}</div>
        <div style={styles.signHint}>{hint}{!isTransfer && "（マイナス不要）"}</div>
        {isTransfer && (
          <>
            <label style={styles.fieldLabel}>方向</label>
            <div style={styles.kindRow}>
              <button style={{ ...styles.kindBtn, ...(dir === "out" ? { background: RED, color: "#fff", borderColor: RED } : {}) }} onClick={() => setDir("out")}>投資へ入れる（−）</button>
              <button style={{ ...styles.kindBtn, ...(dir === "in" ? { background: GREEN, color: "#fff", borderColor: GREEN } : {}) }} onClick={() => setDir("in")}>投資から戻す（＋）</button>
            </div>
          </>
        )}
        <label style={styles.fieldLabel}>口座</label>
        <div style={styles.optionRow}>{config.accounts.map((a) => <button key={a} style={{ ...styles.optionChip, ...(account === a ? styles.optionChipActive : {}) }} onClick={() => setAccount(a)}>{a}</button>)}</div>
        <label style={styles.fieldLabel}>金額</label>
        <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={styles.amountInput} autoFocus /></div>
        <label style={styles.fieldLabel}>月</label>
        <input type="month" value={entryYm} onChange={(e) => setEntryYm(e.target.value)} style={styles.textInput} />
        {editing ? (
          <><button style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>更新する</button><button style={styles.deleteBtn} onClick={() => { onDelete(editing.id); onClose(); }}>削除する</button></>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4, background: "#fff", color: ACCENT, border: `1.5px solid ${ACCENT}` }} onClick={() => saveOne(true)} disabled={!canSave}>保存して続ける</button>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>保存して閉じる</button>
          </div>
        )}
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

function Settings({ config, onSave, entries, cards, debt, onOpenDesign }) {
  const [c, setC] = useState(config);
  useEffect(() => setC(config), [config]);
  const groups = [{ key: "accounts", title: "口座" }, { key: "salaryItems", title: "給与系の項目" }];
  const addItem = (key) => { const name = (prompt(`新しい${groups.find((g) => g.key === key).title}の名前`) || "").trim(); if (!name) return; const next = { ...c, [key]: [...(c[key] || []), name] }; setC(next); onSave(next); };
  const removeItem = (key, i) => { const next = { ...c, [key]: c[key].filter((_, idx) => idx !== i) }; setC(next); onSave(next); };
  const exportJSON = () => { const blob = new Blob([JSON.stringify({ entries, config: c, cards, debt }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const exportCSV = () => { const lines = ["ym,cat,item,account,amount"]; for (const e of entries) lines.push([e.ym, e.cat, `"${e.item || ""}"`, `"${e.account || ""}"`, e.amount].join(",")); const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); };
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>口座や給与項目を追加できます。カードは「カード」タブで管理します。</div>

      {/* デザイン設定への導線 */}
      <button style={styles.navRow} onClick={onOpenDesign}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>デザイン設定</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>配色・フォント・文字の揃え・表の色など</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div style={styles.detailHead}><span>{g.title}</span><button style={styles.addBtn} onClick={() => addItem(g.key)}>＋ 追加</button></div>
          <div style={styles.detailCard}>{(c[g.key] || []).map((name, i) => <div key={i} style={styles.settingRow}><span>{name}</span><button style={styles.removeBtn} onClick={() => removeItem(g.key, i)}>削除</button></div>)}</div>
        </div>
      ))}
      <div style={{ marginBottom: 8 }}>
        <div style={styles.detailHead}><span>バックアップ</span></div>
        <div style={styles.detailCard}>
          <div style={{ fontSize: 12.5, color: MUTED, padding: "8px 2px", lineHeight: 1.6 }}>クラウドに自動保存されますが、手元にも保存できます。</div>
          <button style={styles.backupBtn} onClick={exportCSV}>CSVで書き出す（Excel用）</button>
          <button style={styles.backupBtn} onClick={exportJSON}>バックアップを保存（復元用）</button>
        </div>
      </div>
    </div>
  );
}

// デザイン設定エディタ: 配色・表の色・文字揃え・角丸・行高などを細かく調整
function ThemeEditor({ theme, onSave, onBack, onToggleEdit }) {
  const set = (k, v) => onSave({ ...theme, [k]: v });
  const colorRow = (k, label) => (
    <div style={styles.themeRow} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{theme[k]}</span>
        <input type="color" value={theme[k]} onChange={(e) => set(k, e.target.value)} style={styles.colorInput} />
      </span>
    </div>
  );
  const sliderRow = (k, label, min, max, unit, step) => (
    <div style={styles.themeRow} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="range" min={min} max={max} step={step || 1} value={theme[k]} onChange={(e) => set(k, parseFloat(e.target.value))} style={{ width: 120, accentColor: ACCENT }} />
        <span style={{ fontSize: 12, color: MUTED, width: 42, textAlign: "right" }}>{theme[k]}{unit}</span>
      </span>
    </div>
  );
  const choiceRow = (k, label, options) => (
    <div style={{ ...styles.themeRow, flexWrap: "wrap", gap: 6 }} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(([v, lbl]) => (
          <button key={v} onClick={() => set(k, v)} style={{ ...styles.alignBtn, ...(theme[k] === v ? styles.alignBtnActive : {}) }}>{lbl}</button>
        ))}
      </span>
    </div>
  );
  const toggleRow = (k, label) => (
    <div style={styles.themeRow} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <button onClick={() => set(k, !theme[k])} style={{ ...styles.alignBtn, ...(theme[k] ? styles.alignBtnActive : {}) }}>{theme[k] ? "オン" : "オフ"}</button>
    </div>
  );
  const alignRow = (k, label) => choiceRow(k, label, [["left", "左"], ["center", "中央"], ["right", "右"]]);
  const fontOpts = FONT_CHOICES.map((f) => [f.id, f.label]);
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <button style={styles.backLink} onClick={onBack}>‹ 設定にもどる</button>
      <button style={{ ...styles.navRow, marginBottom: 14 }} onClick={onToggleEdit}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>要素ごとに編集（編集モード）</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>画面の各部分をタップして個別に書式設定</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>以下は全体の既定スタイルです。変更はすぐ反映・自動保存されます。</div>

      <div style={styles.themeSection}>フォント</div>
      <div style={styles.detailCard}>
        {choiceRow("font", "全体のフォント", fontOpts)}
        {choiceRow("numFont", "数字のフォント", fontOpts)}
        {sliderRow("baseSize", "文字の基本サイズ", 12, 18, "px")}
        {choiceRow("heavy", "見出しの太さ", [[600, "普通"], [700, "太い"], [800, "極太"], [900, "最太"]])}
        {sliderRow("tracking", "字間", -0.5, 2, "px", 0.1)}
        {toggleRow("tabularNums", "数字を等幅にそろえる")}
      </div>

      <div style={styles.themeSection}>配色</div>
      <div style={styles.detailCard}>
        {colorRow("accent", "アクセント（緑）")}
        {colorRow("income", "収入の色")}
        {colorRow("expense", "支出の色")}
        {colorRow("ink", "文字の色")}
        {colorRow("paper", "背景の色")}
        {colorRow("muted", "補助文字の色")}
        {colorRow("line", "罫線の色")}
        {colorRow("heroBg", "サマリ上部の背景")}
        {colorRow("heroText", "サマリ上部の文字")}
      </div>

      <div style={styles.themeSection}>表・一覧の色</div>
      <div style={styles.detailCard}>
        {colorRow("cardBg", "カード/セルの背景")}
        {colorRow("thBg", "表の見出し背景")}
        {colorRow("groupBg", "グループ見出し背景")}
        {colorRow("acctBg", "口座見出し背景")}
        {colorRow("subtotalBg", "小計行の背景")}
        {colorRow("totalCellBg", "合計列の背景")}
      </div>

      <div style={styles.themeSection}>タブバー</div>
      <div style={styles.detailCard}>
        {colorRow("tabBg", "タブバーの背景")}
        {colorRow("tabActive", "選択中タブの色")}
      </div>

      <div style={styles.themeSection}>文字の揃え方</div>
      <div style={styles.detailCard}>
        {alignRow("numAlign", "数字の揃え")}
        {alignRow("labelAlign", "項目名の揃え")}
      </div>

      <div style={styles.themeSection}>サイズ・余白</div>
      <div style={styles.detailCard}>
        {sliderRow("radius", "角の丸み", 0, 24, "px")}
        {sliderRow("rowPad", "行の高さ", 6, 20, "px")}
        {sliderRow("numSize", "数字の大きさ", 12, 22, "px")}
      </div>

      <button style={{ ...styles.backupBtn, marginTop: 16, color: RED, borderColor: "#E7C9C0" }} onClick={() => onSave({ ...DEFAULT_THEME })}>初期設定に戻す</button>
    </div>
  );
}

function TabBtn({ active, onClick, label, icon }) {
  return <button onClick={onClick} style={{ ...styles.tabBtn, color: active ? "var(--tab-active)" : MUTED }}><span style={{ fontSize: 17 }}>{icon}</span><span style={{ fontSize: 10.5, marginTop: 3, fontWeight: active ? 700 : 500 }}>{label}</span></button>;
}

const styles = {
  app: { maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: PAPER, color: INK, fontFamily: "var(--font)", fontSize: "var(--base-size)", letterSpacing: "var(--tracking)", position: "relative", paddingBottom: 76, WebkitFontSmoothing: "antialiased" },
  header: { position: "sticky", top: 0, zIndex: 5, background: PAPER, padding: "14px 18px 10px", borderBottom: `1px solid ${LINE}` },
  brandRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  brand: { fontSize: 15, fontWeight: 800, letterSpacing: "0.05em" },
  cloud: { fontSize: 11, color: MUTED },
  monthPicker: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 8 },
  monthArrow: { border: "none", background: "transparent", color: ACCENT, fontSize: 24, width: 36, height: 36, cursor: "pointer" },
  monthSelect: { border: "none", background: "transparent", fontSize: 19, fontWeight: 800, textAlign: "center", color: INK, appearance: "none", WebkitAppearance: "none", textAlignLast: "center", cursor: "pointer", fontFamily: "inherit" },
  main: { padding: "12px 16px" },
  heroCard: { background: "var(--hero-bg)", borderRadius: "var(--radius)", padding: "20px 20px 18px", color: "var(--hero-text)", boxShadow: "0 8px 24px rgba(47,111,91,0.22)", marginBottom: 14 },
  heroLabel: { fontSize: 12, opacity: 0.85, letterSpacing: "0.08em" },
  heroValue: { fontSize: 34, fontWeight: "var(--heavy)", marginTop: 4, letterSpacing: "-0.02em", color: "var(--hero-text)" },
  heroSub: { fontSize: 12.5, opacity: 0.9, marginTop: 6 },
  sumGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 },
  sumCell: { background: "var(--card-bg)", border: `1px solid ${LINE}`, borderRadius: "var(--radius)", padding: "12px 14px" },
  sumCellLabel: { fontSize: 12, color: MUTED },
  sumCellValue: { fontSize: 18, fontWeight: "var(--heavy)", marginTop: 3, fontFamily: "var(--num-font)", fontVariantNumeric: "var(--num-variant)" },
  noteRow: { display: "flex", justifyContent: "flex-end", fontSize: 12, padding: "8px 4px 2px" },
  checkCard: { borderRadius: 12, padding: "11px 14px", marginTop: 12, lineHeight: 1.5 },
  sectionTitle: { fontSize: 13, fontWeight: 700, margin: "18px 4px 8px" },
  balCard: { background: "var(--card-bg)", border: `1px solid ${LINE}`, borderRadius: "var(--radius)", padding: "6px 14px" },
  balRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0" },
  balAcc: { fontSize: 14 },
  balVal: { fontSize: "var(--num-size)", fontWeight: 600, fontVariantNumeric: "var(--num-variant)", fontFamily: "var(--num-font)" },
  viewToggle: { display: "inline-flex", background: "#EFEDE6", borderRadius: 10, padding: 3, marginBottom: 12 },
  viewToggleBtn: { border: "none", background: "transparent", padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: MUTED, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  viewToggleActive: { background: "#fff", color: ACCENT, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800, color: ACCENT, margin: "0 4px 7px" },
  detailCard: { background: "var(--card-bg)", border: `1px solid ${LINE}`, borderRadius: "var(--radius)", padding: "4px 14px 8px" },
  detailRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 6px" },
  editRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 2px", background: "transparent", border: "none", borderBottom: `1px solid ${PAPER}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  editRowRight: { display: "flex", alignItems: "center", gap: 6 },
  chev: { color: MUTED, fontSize: 18, lineHeight: 1 },
  detailSubHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 2px" },
  editSubRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "8px 2px 8px 22px", background: "#FBFAF7", border: "none", borderBottom: `1px solid ${PAPER}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  itemRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "var(--row-pad) 2px", background: "transparent", border: "none", borderBottom: `1px solid ${PAPER}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  itemRowLeft: { display: "flex", alignItems: "center", gap: 6 },
  chevSpacer: { display: "inline-block", width: 16 },
  subGroupHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 6px", fontSize: 12, fontWeight: 700, color: MUTED, borderBottom: `1px solid ${LINE}` },
  subGroupTotal: { fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" },
  subtotalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 2px", marginTop: 2, borderTop: `1.5px solid ${LINE}`, fontSize: 13.5, fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" },
  tdSubLabel: { fontWeight: 800, background: "var(--subtotal-bg)" },
  tdSubTotal: { fontWeight: 800, background: "var(--subtotal-bg)", borderLeft: `1px solid ${LINE}` },
  collapseRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 2px", background: "transparent", border: "none", borderBottom: `1px solid ${PAPER}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  countBadge: { fontSize: 11, color: MUTED, background: "#EFEDE6", borderRadius: 6, padding: "1px 7px", fontWeight: 600 },
  listRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "var(--row-pad) 2px", background: "transparent", border: "none", borderBottom: `1px solid ${PAPER}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  catTag: { fontSize: 10.5, fontWeight: 700, border: "1px solid", borderRadius: 5, padding: "1px 6px" },
  detailItem: { fontSize: 14 },
  detailTotal: { fontSize: "var(--num-size)", fontWeight: 700, fontVariantNumeric: "var(--num-variant)", fontFamily: "var(--num-font)" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 8 },
  chip: { border: `1px solid ${LINE}`, background: PAPER, borderRadius: 8, padding: "4px 9px", fontSize: 12, color: INK, cursor: "pointer", fontVariantNumeric: "tabular-nums", fontFamily: "inherit" },
  chipGhost: { border: "none", background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer", padding: 0 },
  tableScroll: { overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", WebkitOverflowScrolling: "touch" },
  table: { borderCollapse: "collapse", fontSize: 12.5, fontVariantNumeric: "var(--num-variant)", fontFamily: "var(--num-font)", minWidth: "100%" },
  th: { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: MUTED, background: "var(--th-bg)", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap", textAlign: "right" },
  thSticky: { position: "sticky", left: 0, zIndex: 2, textAlign: "left", background: "var(--th-bg)", minWidth: 96 },
  thTotal: { borderLeft: `1px solid ${LINE}`, textAlign: "right" },
  td: { padding: "8px 10px", borderBottom: `1px solid ${PAPER}`, whiteSpace: "nowrap" },
  tdSticky: { position: "sticky", left: 0, background: "var(--card-bg)", zIndex: 1, fontWeight: 600, minWidth: 96, borderRight: `1px solid ${LINE}`, textAlign: "var(--label-align)" },
  tdNum: { padding: "6px 10px", borderBottom: `1px solid ${PAPER}`, textAlign: "var(--num-align)", whiteSpace: "nowrap", fontSize: "var(--num-size)" },
  tdTotalCell: { fontWeight: 700, borderLeft: `1px solid ${LINE}`, background: "var(--total-cell-bg)" },
  tdGroup: { padding: "6px 10px", fontSize: 11.5, fontWeight: 800, color: INK, position: "sticky", left: 0, background: "var(--group-bg)" },
  tdAcct: { padding: "5px 10px", fontSize: 11, fontWeight: 700, color: ACCENT, position: "sticky", left: 0, background: "var(--acct-bg)" },
  cellBtn: { border: "none", background: "transparent", color: "inherit", fontSize: 12.5, cursor: "pointer", fontVariantNumeric: "tabular-nums", padding: 0, minWidth: 20, fontFamily: "inherit" },
  debtSummary: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 16px", marginBottom: 10 },
  cardListRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 2px", borderBottom: `1px solid ${PAPER}`, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  brandTag: { fontSize: 11, color: MUTED, border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 8px" },
  settingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", fontSize: 14, borderBottom: `1px solid ${PAPER}` },
  addBtn: { border: `1px solid ${ACCENT}`, background: ACCENT_SOFT, color: ACCENT, borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  removeBtn: { border: "none", background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer" },
  backupBtn: { display: "block", width: "100%", border: `1px solid ${LINE}`, background: "#fff", color: ACCENT, borderRadius: 10, padding: "11px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", marginTop: 8, fontFamily: "inherit" },
  themeSection: { fontSize: 12.5, fontWeight: 800, color: ACCENT, margin: "18px 4px 7px" },
  navRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "14px 14px", marginBottom: 18, background: "var(--card-bg)", border: `1px solid ${LINE}`, borderRadius: "var(--radius)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  backLink: { border: "none", background: "transparent", color: ACCENT, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 2px 10px", fontFamily: "inherit" },
  editBanner: { position: "fixed", bottom: 58, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#4A3B28", color: "#fff", zIndex: 7 },
  editDone: { border: "none", background: "#fff", color: "#4A3B28", borderRadius: 8, padding: "6px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  fmtGrid: { display: "flex", gap: 10 },
  fmtCell: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 10px" },
  miniClear: { border: "none", background: "transparent", color: MUTED, fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  ovChip: { position: "absolute", top: -9, left: 6, background: "#4A3B28", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, zIndex: 3, cursor: "pointer" },
  themeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 2px", borderBottom: `1px solid ${PAPER}` },
  themeLabel: { fontSize: 13.5 },
  colorInput: { width: 34, height: 26, border: `1px solid ${LINE}`, borderRadius: 6, padding: 0, background: "none", cursor: "pointer" },
  alignBtn: { border: `1px solid ${LINE}`, background: "#fff", borderRadius: 7, padding: "5px 11px", fontSize: 12.5, cursor: "pointer", color: INK, fontFamily: "inherit" },
  alignBtnActive: { background: ACCENT, color: "#fff", borderColor: ACCENT },
  fab: { position: "fixed", right: "max(18px, calc(50% - 240px + 18px))", bottom: 90, width: 58, height: 58, borderRadius: "50%", background: ACCENT, color: "#fff", border: "none", boxShadow: "0 8px 22px rgba(47,111,91,0.4)", cursor: "pointer", zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center" },
  tabs: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", background: "var(--tab-bg)", borderTop: `1px solid ${LINE}`, zIndex: 6 },
  tabBtn: { flex: 1, border: "none", background: "transparent", padding: "9px 0 11px", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", fontFamily: "inherit" },
  sheetBackdrop: { position: "fixed", inset: 0, background: "rgba(28,35,33,0.35)", zIndex: 20, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { width: "100%", maxWidth: 480, background: PAPER, borderRadius: "20px 20px 0 0", padding: "10px 18px calc(20px + env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp 0.22s ease" },
  miniSheet: { width: "100%", maxWidth: 480, background: PAPER, borderRadius: "20px 20px 0 0", padding: "18px 18px calc(20px + env(safe-area-inset-bottom))", animation: "slideUp 0.22s ease" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, background: LINE, margin: "4px auto 12px" },
  sheetTitle: { fontSize: 16, fontWeight: 800, marginBottom: 14 },
  pickRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 4px", background: "transparent", border: "none", borderBottom: `1px solid ${LINE}`, cursor: "pointer", fontFamily: "inherit" },
  pickIcon: { width: 40, height: 40, borderRadius: 12, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 },
  kindRow: { display: "flex", gap: 6, marginBottom: 8 },
  kindBtn: { flex: 1, border: `1px solid ${LINE}`, background: "#fff", borderRadius: 10, padding: "9px 4px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", color: INK, fontFamily: "inherit" },
  fieldLabel: { display: "block", fontSize: 12, color: MUTED, fontWeight: 700, margin: "12px 2px 6px" },
  amountWrap: { display: "flex", alignItems: "center", background: "#fff", border: `1.5px solid ${ACCENT}`, borderRadius: 12, padding: "6px 14px" },
  yenMark: { fontSize: 22, color: MUTED, marginRight: 6 },
  amountInput: { flex: 1, border: "none", outline: "none", fontSize: 28, fontWeight: 800, background: "transparent", color: INK, width: "100%", fontFamily: "inherit" },
  signHint: { fontSize: 11.5, color: MUTED, margin: "6px 2px 0" },
  salaryRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  takeHomeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 2px 0", marginTop: 4, borderTop: `1px solid ${LINE}`, fontSize: 14, fontWeight: 700 },
  optionRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  typeRow: { display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" },
  typeChip: { flexShrink: 0, border: `1px solid ${LINE}`, background: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", color: INK, fontFamily: "inherit", whiteSpace: "nowrap" },
  optionChip: { border: `1px solid ${LINE}`, background: "#fff", borderRadius: 20, padding: "6px 13px", fontSize: 13, cursor: "pointer", color: INK, fontFamily: "inherit" },
  optionChipActive: { background: ACCENT, color: "#fff", borderColor: ACCENT },
  textInput: { width: "100%", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 15, outline: "none", background: "#fff", color: INK, boxSizing: "border-box", fontFamily: "inherit" },
  flash: { background: ACCENT_SOFT, color: ACCENT, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, marginBottom: 10 },
  saveBtn: { width: "100%", border: "none", background: ACCENT, color: "#fff", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 18, fontFamily: "inherit" },
  saveBtnHalf: { flex: 1, border: "none", background: ACCENT, color: "#fff", borderRadius: 12, padding: "13px 8px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  deleteBtn: { width: "100%", border: "none", background: "transparent", color: RED, borderRadius: 12, padding: "12px", fontSize: 13.5, cursor: "pointer", marginTop: 4, fontFamily: "inherit" },
  cancelBtn: { width: "100%", border: "none", background: "transparent", color: MUTED, borderRadius: 12, padding: "10px", fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" },
};

if (typeof document !== "undefined" && !document.getElementById("kakeibo-kf")) {
  const s = document.createElement("style"); s.id = "kakeibo-kf";
  s.textContent = "@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}";
  document.head.appendChild(s);
}
