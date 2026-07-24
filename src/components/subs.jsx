import React, { useState, useMemo } from "react";
import { MUTED } from '../theme.js';
import { yen, uid, subMonthly, subYearly } from '../utils';
import { styles } from '../styles.js';

// 定期費(サブスク・通信費・光熱費・保険など、毎月/毎年決まって出ていく支払い)の台帳。
// 計画タブの「固定費」の土台になり、分類ごとの小計で解約検討にも使える。収支の実績集計には影響しない。
const CATEGORIES = ["サブスク", "通信", "光熱", "保険", "その他"];

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
const renewalSort = (a, b) => {
  if (a.renewal && b.renewal) return a.renewal < b.renewal ? -1 : a.renewal > b.renewal ? 1 : 0;
  if (a.renewal) return -1;
  if (b.renewal) return 1;
  return 0;
};

export function Subs({ subs, onSave, cards }) {
  const [edit, setEdit] = useState(null);
  const monthTotal = useMemo(() => subs.reduce((a, s) => a + subMonthly(s), 0), [subs]);
  const yearTotal = useMemo(() => subs.reduce((a, s) => a + subYearly(s), 0), [subs]);
  // 分類ごとにまとめ、各分類の中は更新日順。分類は登録順(CATEGORIES優先)で並べる。
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of subs) { const k = (s.category || "その他").trim() || "その他"; if (!map.has(k)) map.set(k, []); map.get(k).push(s); }
    for (const arr of map.values()) arr.sort(renewalSort);
    const order = (k) => { const i = CATEGORIES.indexOf(k); return i < 0 ? CATEGORIES.length : i; };
    return Array.from(map.entries()).sort((a, b) => order(a[0]) - order(b[0]));
  }, [subs]);

  const commit = () => {
    if (!edit.name.trim()) return;
    const s = { ...edit, name: edit.name.trim(), category: (edit.category || "").trim(), amount: Number(edit.amount) || 0, cycle: edit.cycle || "monthly" };
    const next = edit.id ? subs.map((x) => (x.id === edit.id ? s : x)) : [...subs, { ...s, id: uid() }];
    onSave(next); setEdit(null);
  };
  const remove = () => { onSave(subs.filter((x) => x.id !== edit.id)); setEdit(null); };
  const newSub = () => setEdit({ name: "", amount: "", cycle: "monthly", category: "", card: "", renewal: "", plan: "", note: "" });

  return (
    <div>
      <div style={styles.subTotals}>
        <div style={styles.subTotalCell}><span style={styles.subTotalLabel}>月換算合計</span><span style={styles.subTotalValue}>{yen(monthTotal)}</span></div>
        <div style={styles.subTotalDiv} />
        <div style={styles.subTotalCell}><span style={styles.subTotalLabel}>年合計</span><span style={styles.subTotalValue}>{yen(yearTotal)}</span></div>
      </div>
      <div style={styles.detailHead}><span>登録中（{subs.length}）</span><button style={styles.addBtn} onClick={newSub}>＋ 追加</button></div>
      {subs.length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>まだ登録がありません。「＋ 追加」からサブスク・通信費・光熱費などを登録できます。</div></div>
      ) : (
        groups.map(([cat, items]) => {
          const catMonthly = items.reduce((a, s) => a + subMonthly(s), 0);
          return (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={styles.memoGroupHead}><span>{cat}</span><span style={styles.memoGroupSum}>月換算 {yen(catMonthly)}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((s) => {
                  const d = daysUntil(s.renewal);
                  const soon = d != null && d >= 0 && d <= SOON_DAYS;
                  const past = d != null && d < 0;
                  return (
                    <button key={s.id} style={{ ...styles.memoCard, ...(soon ? { border: "1.5px solid var(--accent)" } : {}) }} onClick={() => setEdit({ ...s, amount: s.amount ? String(s.amount) : "", category: s.category || "" })}>
                      <div style={styles.memoHead}>
                        <span style={styles.memoTitle}>{s.name}{s.plan ? <span style={styles.subCycle}>　{s.plan}</span> : null}</span>
                        <span style={styles.memoAmount}>{yen(s.amount)}<span style={styles.subCycle}>/{s.cycle === "yearly" ? "年" : "月"}</span></span>
                      </div>
                      <div style={styles.subMeta}>
                        {soon && <span style={styles.subDue}>{d === 0 ? "本日更新" : `更新まであと${d}日`}</span>}
                        {past && <span style={styles.subDuePast}>更新日を過ぎています</span>}
                        {s.card && <span style={styles.brandTag}>{s.card}</span>}
                        {s.renewal && <span style={styles.brandTag}>更新 {s.renewal}</span>}
                        {s.cycle === "yearly" && <span style={styles.subMonthly}>月換算 {yen(subMonthly(s))}</span>}
                      </div>
                      {s.note && <div style={styles.memoBody}>{s.note}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>{edit.id ? "定期費を編集" : "定期費を追加"}</div>
            <label style={styles.fieldLabel}>名前</label>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="例）Netflix / 通信費" style={styles.textInput} autoFocus />
            <label style={styles.fieldLabel}>分類</label>
            <div style={styles.optionRow}>
              {CATEGORIES.map((c) => (
                <button key={c} style={{ ...styles.optionChip, ...(edit.category === c ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, category: c })}>{c}</button>
              ))}
            </div>
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
            {edit.id && <button style={styles.deleteBtn} onClick={remove}>この定期費を削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
