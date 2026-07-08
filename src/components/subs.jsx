import React, { useState, useMemo } from "react";
import { MUTED } from '../theme.js';
import { yen, uid } from '../utils';
import { styles } from '../styles.js';

// 月換算: 月額はそのまま、年払いは /12。年換算: 月額は ×12、年払いはそのまま。
const perMonth = (s) => (s.cycle === "yearly" ? (Number(s.amount) || 0) / 12 : (Number(s.amount) || 0));
const perYear = (s) => (s.cycle === "yearly" ? (Number(s.amount) || 0) : (Number(s.amount) || 0) * 12);

// 更新日までの残り日数(日付のみで計算)。renewal が無ければ null。
const daysUntil = (renewal) => {
  if (!renewal) return null;
  const [y, m, d] = renewal.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(y, m - 1, d);
  return Math.round((target - today) / 86400000);
};
const SOON_DAYS = 14; // この日数以内の更新を「間近」としてハイライト

export function Subs({ subs, onSave, cards }) {
  const [edit, setEdit] = useState(null);
  const monthTotal = useMemo(() => subs.reduce((a, s) => a + perMonth(s), 0), [subs]);
  const yearTotal = useMemo(() => subs.reduce((a, s) => a + perYear(s), 0), [subs]);
  // 更新日順に並び替え(更新日ありを昇順=近い/過ぎた順、更新日なしは末尾)
  const sorted = useMemo(() => [...subs].sort((a, b) => {
    if (a.renewal && b.renewal) return a.renewal < b.renewal ? -1 : a.renewal > b.renewal ? 1 : 0;
    if (a.renewal) return -1;
    if (b.renewal) return 1;
    return 0;
  }), [subs]);
  const commit = () => {
    if (!edit.name.trim()) return;
    const s = { ...edit, name: edit.name.trim(), amount: Number(edit.amount) || 0, cycle: edit.cycle || "monthly" };
    const next = edit.id ? subs.map((x) => (x.id === edit.id ? s : x)) : [...subs, { ...s, id: uid() }];
    onSave(next); setEdit(null);
  };
  const remove = () => { onSave(subs.filter((x) => x.id !== edit.id)); setEdit(null); };
  const newSub = () => setEdit({ name: "", amount: "", cycle: "monthly", card: "", renewal: "", plan: "", note: "" });
  return (
    <div>
      <div style={styles.subTotals}>
        <div style={styles.subTotalCell}><span style={styles.subTotalLabel}>月換算合計</span><span style={styles.subTotalValue}>{yen(monthTotal)}</span></div>
        <div style={styles.subTotalDiv} />
        <div style={styles.subTotalCell}><span style={styles.subTotalLabel}>年合計</span><span style={styles.subTotalValue}>{yen(yearTotal)}</span></div>
      </div>
      <div style={styles.detailHead}><span>登録中（{subs.length}）</span><button style={styles.addBtn} onClick={newSub}>＋ 追加</button></div>
      {subs.length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>まだサブスクがありません。「＋ 追加」から登録できます。</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((s) => {
            const d = daysUntil(s.renewal);
            const soon = d != null && d >= 0 && d <= SOON_DAYS;
            const past = d != null && d < 0;
            return (
              <button key={s.id} style={{ ...styles.memoCard, ...(soon ? { border: "1.5px solid var(--accent)" } : {}) }} onClick={() => setEdit({ ...s, amount: s.amount ? String(s.amount) : "" })}>
                <div style={styles.memoHead}>
                  <span style={styles.memoTitle}>{s.name}{s.plan ? <span style={styles.subCycle}>　{s.plan}</span> : null}</span>
                  <span style={styles.memoAmount}>{yen(s.amount)}<span style={styles.subCycle}>/{s.cycle === "yearly" ? "年" : "月"}</span></span>
                </div>
                <div style={styles.subMeta}>
                  {soon && <span style={styles.subDue}>{d === 0 ? "本日更新" : `更新まであと${d}日`}</span>}
                  {past && <span style={styles.subDuePast}>更新日を過ぎています</span>}
                  {s.card && <span style={styles.brandTag}>{s.card}</span>}
                  {s.renewal && <span style={styles.brandTag}>更新 {s.renewal}</span>}
                  {s.cycle === "yearly" && <span style={styles.subMonthly}>月換算 {yen(perMonth(s))}</span>}
                </div>
                {s.note && <div style={styles.memoBody}>{s.note}</div>}
              </button>
            );
          })}
        </div>
      )}
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>{edit.id ? "サブスクを編集" : "サブスクを追加"}</div>
            <label style={styles.fieldLabel}>サービス名</label>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="例）Netflix" style={styles.textInput} autoFocus />
            <label style={styles.fieldLabel}>料金</label>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="0" style={styles.amountInput} /></div>
            <label style={styles.fieldLabel}>周期</label>
            <div style={styles.kindRow}>
              {[["monthly", "月額"], ["yearly", "年払い"]].map(([v, l]) => (
                <button key={v} style={{ ...styles.kindBtn, ...(edit.cycle === v ? { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" } : {}) }} onClick={() => setEdit({ ...edit, cycle: v })}>{l}</button>
              ))}
            </div>
            <label style={styles.fieldLabel}>支払いカード（任意）</label>
            <div style={styles.optionRow}>
              <button style={{ ...styles.optionChip, ...(!edit.card ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, card: "" })}>なし</button>
              {cards.map((c) => (
                <button key={c.id} style={{ ...styles.optionChip, ...(edit.card === c.name ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, card: c.name })}>{c.name}</button>
              ))}
            </div>
            <label style={styles.fieldLabel}>更新日（任意）</label>
            <input type="date" value={edit.renewal ?? ""} onChange={(e) => setEdit({ ...edit, renewal: e.target.value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>プラン名（任意）</label>
            <input value={edit.plan ?? ""} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} placeholder="例）Premium / 年間プラン" style={styles.textInput} />
            <label style={styles.fieldLabel}>メモ（任意）</label>
            <textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="解約条件や備考など" style={styles.memoTextarea} />
            <button style={{ ...styles.saveBtn, opacity: edit.name.trim() ? 1 : 0.4 }} onClick={commit} disabled={!edit.name.trim()}>{edit.id ? "更新する" : "追加する"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={remove}>このサブスクを削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
