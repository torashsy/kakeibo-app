import React, { useState, useEffect, useMemo, createContext, useContext } from "react";
import { ACCENT, ACCENT_SOFT, INK, PAPER, LINE, MUTED, RED, GREEN, FONT_CHOICES, fontStack, DEFAULT_THEME, ovStyle, EDIT_OUTLINE, CONTAINER_IDS, themeVars, TARGET_LABELS } from './theme.js';
import { yen, num, ymLabel, uid, addMonth, migrateEntry, DEFAULT_CONFIG, ACCOUNT_TYPES, acctRole, DEFAULT_CARDS, SEED_ENTRIES, SEED_DEBT, buildStructure } from './utils.js';
import { styles } from './styles.js';

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






