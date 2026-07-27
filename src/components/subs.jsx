import React, { useState, useMemo } from "react";
import { INK, LINE, MUTED } from '../theme.js';
import { yen, uid, subMonthly, subYearly, subActiveForMonth, evalAmount } from '../utils';
import { styles } from '../styles.js';
import { AmountField } from './amount.jsx';

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

export function Subs({ subs, onSave, cards, ym }) {
  const [edit, setEdit] = useState(null);
  const [openGroups, setOpenGroups] = useState({});
  const activeSubs = useMemo(() => subs.filter((s) => subActiveForMonth(s, ym)), [subs, ym]);
  const monthTotal = useMemo(() => activeSubs.reduce((a, s) => a + subMonthly(s), 0), [activeSubs]);
  const yearTotal = useMemo(() => activeSubs.reduce((a, s) => a + subYearly(s), 0), [activeSubs]);
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
    if (edit.startDate && edit.endDate && edit.endDate < edit.startDate) return;
    const s = { ...edit, name: edit.name.trim(), category: (edit.category || "").trim(), amount: Math.round(evalAmount(edit.amount) || 0), cycle: edit.cycle || "monthly" };
    const next = edit.id ? subs.map((x) => (x.id === edit.id ? s : x)) : [...subs, { ...s, id: uid() }];
    onSave(next); setEdit(null);
  };
  const remove = () => { onSave(subs.filter((x) => x.id !== edit.id)); setEdit(null); };
  const newSub = () => setEdit({ name: "", amount: "", cycle: "monthly", category: "", card: "", renewal: "", startDate: "", endDate: "", plan: "", note: "" });

  return (
    <div>
      <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 12 }}>
        <div style={styles.subtotalRow}><span>月換算</span><span style={styles.editRowRight}><span style={styles.subtotalNum}>{yen(monthTotal)}</span><span style={styles.chevRSpacer} /></span></div>
        <div style={{ ...styles.subtotalRow, borderTop: "none", marginTop: 0 }}><span>年合計</span><span style={styles.editRowRight}><span style={styles.subtotalNum}>{yen(yearTotal)}</span><span style={styles.chevRSpacer} /></span></div>
      </div>
      <div style={styles.detailHead}><span>一覧（{subs.length}）</span><button style={styles.addBtn} onClick={newSub}>＋ 追加</button></div>
      {subs.length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>登録なし</div></div>
      ) : (
        groups.map(([cat, items]) => {
          const catMonthly = items.filter((s) => subActiveForMonth(s, ym)).reduce((a, s) => a + subMonthly(s), 0);
          const open = !!openGroups[cat];
          return (
            <div key={cat} style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
              <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpenGroups((value) => ({ ...value, [cat]: !value[cat] }))} aria-expanded={open}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>{cat}<span style={styles.countBadge}>{items.length}</span></span>
                <span style={{ ...styles.detailTotal, color: INK }}>{yen(catMonthly)}</span>
              </button>
              {open && <div style={{ paddingBottom: 4 }}>
                {items.map((s) => {
                  const d = daysUntil(s.renewal);
                  const soon = d != null && d >= 0 && d <= SOON_DAYS;
                  const past = d != null && d < 0;
                  const ended = !!s.endDate && s.endDate < new Date().toISOString().slice(0, 10);
                  return (
                    <button key={s.id} style={{ ...styles.itemRow, ...(soon ? { color: "var(--accent)" } : {}) }} onClick={() => setEdit({ ...s, amount: s.amount ? String(s.amount) : "", category: s.category || "" })}>
                      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{s.name}{s.plan ? <small style={styles.subCycle}>　{s.plan}</small> : null}</span>
                        <span style={{ ...styles.subMeta, marginTop: 4 }}>
                        {ended ? <span style={styles.subDuePast}>解約済み</span> : soon && <span style={styles.subDue}>{d === 0 ? "本日更新" : `更新まであと${d}日`}</span>}
                        {!ended && past && <span style={styles.subDuePast}>更新日を過ぎています</span>}
                        {s.card && <span style={styles.brandTag}>{s.card}</span>}
                        {s.renewal && <span style={styles.brandTag}>更新 {s.renewal}</span>}
                        </span>
                      </span>
                      <span style={styles.editRowRight}><span style={styles.detailTotal}>{yen(s.amount)}<small style={styles.subCycle}>/{s.cycle === "yearly" ? "年" : "月"}</small></span><span style={styles.chev}>›</span></span>
                    </button>
                  );
                })}
              </div>}
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
            <AmountField value={edit.amount ?? ""} onChange={(v) => setEdit({ ...edit, amount: v })} />
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
            <label style={styles.fieldLabel}>更新日</label>
            <input type="date" value={edit.renewal ?? ""} onChange={(e) => setEdit({ ...edit, renewal: e.target.value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>開始日</label>
            <input type="date" value={edit.startDate ?? ""} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>終了予定日・解約日</label>
            <input type="date" value={edit.endDate ?? ""} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>プラン名（任意）</label>
            <input value={edit.plan ?? ""} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} placeholder="例）Premium / 年間プラン" style={styles.textInput} />
            <label style={styles.fieldLabel}>メモ（任意）</label>
            <textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="解約条件や備考など" style={styles.memoTextarea} />
            <button style={{ ...styles.saveBtn, opacity: edit.name.trim() && !(edit.startDate && edit.endDate && edit.endDate < edit.startDate) ? 1 : 0.4 }} onClick={commit} disabled={!edit.name.trim() || !!(edit.startDate && edit.endDate && edit.endDate < edit.startDate)}>{edit.id ? "更新" : "追加"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={remove}>削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
