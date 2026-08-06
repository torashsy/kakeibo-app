import React, { useMemo, useState } from "react";
import { ACCENT, INK, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, addMonth, evalAmount, ACCOUNT_TYPES, acctRole, entryDate, cycleYm, periodLabel } from '../utils';
import { styles } from '../styles.js';
import { Icon } from '../icons.jsx';
import { AmountField } from './amount.jsx';
import { ClearableCalendarInput } from './calendar-input.jsx';

export function PickCategory({ onClose, onPick }) {
  const cats = [
    { id: "close", label: "まとめ入力", color: ACCENT, icon: "check" },
    { id: "salary", label: "給与", color: GREEN, icon: "yen" },
    { id: "card", label: "カード", color: RED, icon: "card" },
    { id: "account", label: "口座", color: ACCENT, icon: "bank" },
    { id: "import", label: "取込", color: MUTED, icon: "camera" },
  ];
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>追加</div>
        {cats.map((c) => (
          <button key={c.id} style={styles.pickRow} onClick={() => onPick(c.id)}>
            <span style={{ ...styles.pickIcon, background: c.color }}><Icon name={c.icon} size={22} /></span>
            <span style={{ textAlign: "left", flex: 1, fontSize: 15, fontWeight: 600 }}>{c.label}</span>
            <span style={{ color: MUTED, fontSize: 20 }}>›</span>
          </button>
        ))}
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

export function SalaryEditForm({ editing, onClose, onUpdate, onDelete }) {
  const isDeduction = editing.item === "控除";
  const [amount, setAmount] = useState(Math.abs(editing.amount).toString());
  const canSave = evalAmount(amount) != null;
  const submit = () => {
    if (!canSave) return;
    const v = Math.abs(Math.round(evalAmount(amount) || 0));
    onUpdate({ ...editing, amount: isDeduction ? -v : v });
    onClose();
  };
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{editing.item}を編集（{ymLabel(editing.ym)}）</div>
        <label style={styles.fieldLabel}>金額</label>
        <AmountField value={amount} onChange={setAmount} autoFocus />
        <button style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }} onClick={submit} disabled={!canSave}>更新</button>
        <button style={styles.deleteBtn} onClick={() => { onDelete(editing.id); onClose(); }}>削除</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

export function SalaryForm({ ym, config, entries, onClose, onSave }) {
  const existing = useMemo(() => entries.filter((e) => e.ym === ym && e.cat === "salary"), [entries, ym]);
  const prevYm = addMonth(ym, -1);
  const prevEntries = useMemo(() => entries.filter((e) => e.ym === prevYm && e.cat === "salary"), [entries, prevYm]);
  const [rows, setRows] = useState(config.salaryItems.map((it) => { const f = existing.find((e) => e.item === it); return { item: it, amount: f ? Math.abs(f.amount).toString() : "" }; }));
  const setAmt = (i, v) => setRows(rows.map((r, idx) => (idx === i ? { ...r, amount: v } : r)));
  const copyPrev = () => setRows(config.salaryItems.map((it) => { const f = prevEntries.find((e) => e.item === it); return { item: it, amount: f ? Math.abs(f.amount).toString() : "" }; }));
  const takeHome = rows.reduce((a, r) => { const v = evalAmount(r.amount); if (v == null) return a; return a + (r.item === "控除" ? -Math.abs(v) : v); }, 0);
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>給与系（{ymLabel(ym)}）</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {prevEntries.length > 0 && <button style={styles.chipGhost} onClick={copyPrev}>前月をコピー</button>}
        </div>
        {rows.map((r, i) => (
          <div key={r.item} style={styles.salaryRow}>
            <span style={{ fontSize: 14, width: 64, color: r.item === "控除" ? MUTED : INK, fontWeight: 600 }}>{r.item}</span>
            <div style={{ flex: 1 }}>
              <AmountField value={r.amount} onChange={(v) => setAmt(i, v)} wrapStyle={{ padding: "5px 12px", border: `1px solid ${LINE}` }} inputStyle={{ fontSize: 18 }} />
            </div>
          </div>
        ))}
        <div style={styles.takeHomeRow}><span>手取り見込み</span><span style={{ fontWeight: 600, color: GREEN }}>{yen(takeHome)}</span></div>
        <button style={styles.saveBtn} onClick={() => onSave(rows)}>保存</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}


// 手入力でも取引日を持てるようにする。日付を入れると、その日が属する月度へ自動で振り分ける。
// 日付を入れない(または元から持っていない)記録は、これまでどおり月度を直接選ぶ。
function DateField({ date, setDate, entryYm, setEntryYm, cutoffDay }) {
  return (
    <>
      <label style={styles.fieldLabel}>日付</label>
      <ClearableCalendarInput value={date} onChange={setDate} style={{ ...styles.dateInput, marginBottom: 4 }} />
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>
        {date ? `${periodLabel(cycleYm(date, cutoffDay), cutoffDay)} に入ります` : "日付を入れると、その日の月度へ自動で振り分けます"}
      </div>
      {!date && (
        <>
          <label style={styles.fieldLabel}>月度</label>
          <input type="month" value={entryYm} onChange={(e) => setEntryYm(e.target.value)} style={styles.dateInput} />
        </>
      )}
    </>
  );
}

export function CardForm({ ym, config, cards, entries, editing, onClose, onAdd, onUpdate, onDelete }) {
  const [item, setItem] = useState(editing ? editing.item : "");
  const [amount, setAmount] = useState(editing ? Math.abs(editing.amount).toString() : "");
  const [entryYm, setEntryYm] = useState(editing ? editing.ym : ym);
  const [date, setDate] = useState(editing ? (entryDate(editing) || "") : "");
  const [flash, setFlash] = useState("");
  const cutoffDay = config.cycleCutoffDay;
  const canSave = item && evalAmount(amount) != null;
  const prevAmt = useMemo(() => {
    if (!item || editing) return null;
    const prevYm = addMonth(entryYm, -1);
    const f = (entries || []).find((e) => e.cat === "card" && e.item === item && e.ym === prevYm);
    return f ? Math.abs(f.amount) : null;
  }, [item, entryYm, entries, editing]);
  const build = () => ({ ...(editing || {}), id: editing ? editing.id : undefined,
    ym: date ? cycleYm(date, cutoffDay) : entryYm, cat: "card", item, account: "",
    amount: Math.abs(Math.round(evalAmount(amount) || 0)), ...(date ? { date } : {}) });
  const saveOne = (cont) => {
    if (!canSave) return;
    if (editing) { onUpdate({ ...build(), id: editing.id }); onClose(); return; }
    onAdd(build());
    if (cont) { setFlash(`${item} ${yen(Math.abs(Math.round(evalAmount(amount) || 0)))} を追加`); setItem(""); setAmount(""); setTimeout(() => setFlash(""), 1600); } else onClose();
  };
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{editing ? "カード請求を編集" : "カード請求を追加"}</div>
        {flash && <div style={styles.flash}>✓ {flash}</div>}
        <label style={styles.fieldLabel}>カード</label>
        <div style={styles.optionRow}>{cards.map((c) => <button key={c.id} style={{ ...styles.optionChip, ...(item === c.name ? styles.optionChipActive : {}) }} onClick={() => setItem(c.name)}>{c.name}</button>)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={styles.fieldLabel}>請求額</label>
          {prevAmt != null && <button style={styles.chipGhost} onClick={() => setAmount(String(prevAmt))}>前月 {yen(prevAmt)} をコピー</button>}
        </div>
        <AmountField value={amount} onChange={setAmount} autoFocus />
        <DateField date={date} setDate={setDate} entryYm={entryYm} setEntryYm={setEntryYm} cutoffDay={cutoffDay} />
        {editing ? (
          <><button style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>更新</button><button style={styles.deleteBtn} onClick={() => { onDelete(editing.id); onClose(); }}>削除</button></>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4, background: "#fff", color: ACCENT, border: `1.5px solid ${ACCENT}` }} onClick={() => saveOne(true)} disabled={!canSave}>続ける</button>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>保存</button>
          </div>
        )}
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

export function AccountForm({ ym, config, entries, editing, onClose, onAdd, onUpdate, onDelete }) {
  const [type, setType] = useState(editing ? editing.item : "残高");
  const [account, setAccount] = useState(editing ? editing.account : (config.accounts[0] || ""));
  const [amount, setAmount] = useState(editing ? Math.abs(editing.amount).toString() : "");
  const [dir, setDir] = useState(editing && editing.amount < 0 ? "out" : "in"); // 投資振替の方向
  const [entryYm, setEntryYm] = useState(editing ? editing.ym : ym);
  const [date, setDate] = useState(editing ? (entryDate(editing) || "") : "");
  const [flash, setFlash] = useState("");
  const cutoffDay = config.cycleCutoffDay;
  const isTransfer = acctRole(type) === "transfer";
  const canSave = account && evalAmount(amount) != null;
  const prevEntry = useMemo(() => {
    if (editing || !account) return null;
    const prevYm = addMonth(entryYm, -1);
    return (entries || []).find((e) => e.cat === "account" && e.item === type && e.account === account && e.ym === prevYm) || null;
  }, [type, account, entryYm, entries, editing]);
  const usePrev = () => { setAmount(String(Math.abs(prevEntry.amount))); if (isTransfer) setDir(prevEntry.amount < 0 ? "out" : "in"); };
  const signed = () => {
    const v = Math.abs(Math.round(evalAmount(amount) || 0));
    if (isTransfer) return dir === "out" ? -v : v;   // 入れる=−(支出方向) / 戻す=＋(収入方向)
    return acctRole(type) === "out" ? -v : v;
  };
  const build = () => ({ ...(editing || {}), id: editing ? editing.id : undefined,
    ym: date ? cycleYm(date, cutoffDay) : entryYm, cat: "account", item: type, account,
    amount: signed(), ...(date ? { date } : {}) });
  const saveOne = (cont) => {
    if (!canSave) return;
    if (editing) { onUpdate({ ...build(), id: editing.id }); onClose(); return; }
    onAdd(build());
    if (cont) { setFlash(`${account} ${type} ${yen(signed())}`); setAmount(""); setTimeout(() => setFlash(""), 1600); } else onClose();
  };
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{editing ? "口座の記録を編集" : "口座の記録を追加"}</div>
        {flash && <div style={styles.flash}>✓ {flash}</div>}
        <label style={styles.fieldLabel}>種類</label>
        <div style={styles.typeRow}>{ACCOUNT_TYPES.map((t) => <button key={t.id} style={{ ...styles.typeChip, ...(type === t.id ? styles.optionChipActive : {}) }} onClick={() => setType(t.id)}>{t.id}</button>)}</div>
        {isTransfer && (
          <>
            <label style={styles.fieldLabel}>方向</label>
            <div style={styles.kindRow}>
              <button style={{ ...styles.kindBtn, ...(dir === "out" ? { background: RED, color: "#fff", border: `1px solid ${RED}` } : {}) }} onClick={() => setDir("out")}>投資へ入れる（−）</button>
              <button style={{ ...styles.kindBtn, ...(dir === "in" ? { background: GREEN, color: "#fff", border: `1px solid ${GREEN}` } : {}) }} onClick={() => setDir("in")}>投資から戻す（＋）</button>
            </div>
          </>
        )}
        <label style={styles.fieldLabel}>口座</label>
        <div style={styles.optionRow}>{config.accounts.map((a) => <button key={a} style={{ ...styles.optionChip, ...(account === a ? styles.optionChipActive : {}) }} onClick={() => setAccount(a)}>{a}</button>)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={styles.fieldLabel}>金額</label>
          {prevEntry && <button style={styles.chipGhost} onClick={usePrev}>前月 {yen(Math.abs(prevEntry.amount))} をコピー</button>}
        </div>
        <AmountField value={amount} onChange={setAmount} autoFocus />
        <DateField date={date} setDate={setDate} entryYm={entryYm} setEntryYm={setEntryYm} cutoffDay={cutoffDay} />
        {editing ? (
          <><button style={{ ...styles.saveBtn, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>更新</button><button style={styles.deleteBtn} onClick={() => { onDelete(editing.id); onClose(); }}>削除</button></>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4, background: "#fff", color: ACCENT, border: `1.5px solid ${ACCENT}` }} onClick={() => saveOne(true)} disabled={!canSave}>続ける</button>
            <button style={{ ...styles.saveBtnHalf, opacity: canSave ? 1 : 0.4 }} onClick={() => saveOne(false)} disabled={!canSave}>保存</button>
          </div>
        )}
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
