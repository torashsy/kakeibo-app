import React, { useMemo, useState } from "react";
import { ACCENT, INK, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, ACCOUNT_TYPES, acctRole } from '../utils.js';
import { styles } from '../styles.js';

export function PickCategory({ onClose, onPick }) {
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
            <span style={{ textAlign: "left", flex: 1 }}><span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{c.label}</span><span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 2 }}>{c.desc}</span></span>
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

export function SalaryForm({ ym, config, entries, onClose, onSave }) {
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
            <span style={{ fontSize: 14, width: 64, color: r.item === "控除" ? MUTED : INK, fontWeight: 600 }}>{r.item}</span>
            <div style={{ ...styles.amountWrap, flex: 1, padding: "5px 12px", border: `1px solid ${LINE}` }}>
              <span style={{ ...styles.yenMark, fontSize: 16 }}>¥</span>
              <input type="number" inputMode="numeric" value={r.amount} onChange={(e) => setAmt(i, e.target.value)} placeholder="0" style={{ ...styles.amountInput, fontSize: 18 }} />
            </div>
          </div>
        ))}
        <div style={styles.takeHomeRow}><span>手取り見込み</span><span style={{ fontWeight: 600, color: GREEN }}>{yen(takeHome)}</span></div>
        <button style={styles.saveBtn} onClick={() => onSave(rows)}>保存する</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

export function CardForm({ ym, cards, editing, onClose, onAdd, onUpdate, onDelete }) {
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

export function AccountForm({ ym, config, editing, onClose, onAdd, onUpdate, onDelete }) {
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
              <button style={{ ...styles.kindBtn, ...(dir === "out" ? { background: RED, color: "#fff", border: `1px solid ${RED}` } : {}) }} onClick={() => setDir("out")}>投資へ入れる（−）</button>
              <button style={{ ...styles.kindBtn, ...(dir === "in" ? { background: GREEN, color: "#fff", border: `1px solid ${GREEN}` } : {}) }} onClick={() => setDir("in")}>投資から戻す（＋）</button>
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
