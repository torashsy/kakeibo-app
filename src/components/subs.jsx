import React, { useState, useMemo } from "react";
import { INK, LINE, MUTED } from '../theme.js';
import { yen, uid, subMonthly, subYearly, subActiveForMonth, evalAmount } from '../utils';
import { styles } from '../styles.js';
import { AmountField } from './amount.jsx';
import { ClearableCalendarInput } from './calendar-input.jsx';
import { EntrySheet } from './entry-sheet.jsx';
import { subscriptionStatus, subscriptionToday } from '../subscription-sync.js';

// 定期費(サブスク・通信費・光熱費・保険など、毎月/毎年決まって出ていく支払い)の台帳。
// 計画タブの「固定費」の土台になり、分類ごとの小計で解約検討にも使える。収支の実績集計には影響しない。
const CATEGORIES = ["サブスク", "通信", "光熱", "保険", "その他"];

const renewalSort = (a, b) => {
  if (a.renewal && b.renewal) return a.renewal < b.renewal ? -1 : a.renewal > b.renewal ? 1 : 0;
  if (a.renewal) return -1;
  if (b.renewal) return 1;
  return 0;
};

export function Subs({ subs, onSave, cards, ym, initialEditId, onCloseEdit }) {
  const [edit, setEdit] = useState(()=>subs.find(s=>s.id===initialEditId)||null);
  const closeEdit=()=>{setEdit(null);onCloseEdit?.();};
  const today = subscriptionToday();
  const visibleSubs = subs.filter(s => !s.hidden);
  const activeSubs = useMemo(() => subs.filter((s) => subActiveForMonth(s, ym)), [subs, ym]);
  const monthTotal = useMemo(() => activeSubs.reduce((a, s) => a + subMonthly(s), 0), [activeSubs]);
  const yearTotal = useMemo(() => activeSubs.reduce((a, s) => a + subYearly(s), 0), [activeSubs]);
  // 契約状態ごとに並べ、更新日と解約状態を一覧に出す。
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of visibleSubs) {
      const k = s.subscriptionSync?.status === 'canceled' || (s.endDate && s.endDate < today) ? '解約・終了' : s.subscriptionSync?.status === 'unconfirmed' ? '継続未確認' : '定期支払い';
      if (!map.has(k)) map.set(k, []); map.get(k).push(s);
    }
    for (const arr of map.values()) arr.sort(renewalSort);
    const order = k => ['定期支払い', '継続未確認', '解約・終了'].indexOf(k);
    return Array.from(map.entries()).sort((a, b) => order(a[0]) - order(b[0]));
  }, [subs, today]);

  const commit = () => {
    if (!edit.name.trim()) return;
    if (edit.startDate && edit.endDate && edit.endDate < edit.startDate) return;
    const renewalDay = edit.renewal ? Number(edit.renewal.slice(8, 10)) : undefined;
    const s = { ...edit, name: edit.name.trim(), category: (edit.category || "").trim(), amount: Math.round(evalAmount(edit.amount) || 0), cycle: edit.cycle || "monthly", renewalDay };
    const next = edit.id ? subs.map((x) => (x.id === edit.id ? s : x)) : [...subs, { ...s, id: uid() }];
    onSave(next); closeEdit();
  };
  const remove = () => { onSave(edit.subscriptionSync ? subs.map(x => x.id === edit.id ? { ...x, hidden: true } : x) : subs.filter(x => x.id !== edit.id)); closeEdit(); };
  const newSub = () => setEdit({ name: "", amount: "", cycle: "monthly", category: "", card: "", renewal: "", startDate: "", endDate: "", autoRenew: true, plan: "", note: "" });

  return (
    <div>
      <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 12 }}>
        <div style={styles.subtotalRow}><span>月換算</span><span style={styles.editRowRight}><span style={styles.subtotalNum}>{yen(monthTotal)}</span></span></div>
        <div style={{ ...styles.subtotalRow, borderTop: "none", marginTop: 0 }}><span>年換算</span><span style={styles.editRowRight}><span style={styles.subtotalNum}>{yen(yearTotal)}</span></span></div>
      </div>
      <div style={styles.detailHead}><span>定期費（{visibleSubs.length}）</span><button style={styles.addBtn} onClick={newSub}>＋ 追加</button></div>
      {visibleSubs.length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>登録なし</div></div>
      ) : (
        groups.map(([cat, items]) => {
          const catMonthly = items.filter((s) => subActiveForMonth(s, ym)).reduce((a, s) => a + subMonthly(s), 0);
          return (
            <div key={cat} style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
              <div style={{ ...styles.collapseRow, borderBottom: `1px solid ${LINE}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}>{cat}<span style={styles.countBadge}>{items.length}</span></span>
                <span style={{ ...styles.detailTotal, color: INK }}>{yen(catMonthly)}</span>
              </div>
              <div style={{ paddingBottom: 4 }}>
                {items.map((s) => {
                  const ended = s.subscriptionSync?.status === 'canceled' || !!s.endDate && s.endDate < today;
                  const synced = s.subscriptionSync;
                  const cycleLabel = synced && !synced.cycleKnown ? '周期未確認' : s.cycle === 'yearly' ? '年額' : '月額';
                  return (
                    <button key={s.id} className="subscription-row" style={{ ...styles.itemRow, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 12, rowGap: 5, padding: '17px 0', textAlign: 'left' }} onClick={() => setEdit({ ...s, amount: s.amount !== '' ? String(s.amount) : "", category: s.category || "" })}>
                      <span style={{ minWidth: 0, fontSize: 15, fontWeight: 600, color: INK, overflowWrap: 'anywhere' }}>{s.name}</span>
                      <span style={{ ...styles.detailTotal, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.amount === '' ? '—' : yen(s.amount)}</span>
                      <span style={{ color: MUTED, fontSize: 12, overflowWrap: 'anywhere' }}>{s.plan || 'プラン未確認'}{synced ? ` · ${synced.channel}` : ''}</span>
                      <span style={{ color: MUTED, fontSize: 12, textAlign: 'right' }}>{cycleLabel}{synced?.cycleBasis === '請求間隔' ? '（推定）' : ''}</span>
                      <span style={{ gridColumn: '1 / -1', color: MUTED, fontSize: 12, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                        <span>{subscriptionStatus(s, today)}</span>
                        {ended ? s.endDate && <span>{s.endDate}まで</span> : synced?.status === 'unconfirmed' && (!s.renewal || s.renewal < today) ? <span>{synced.lastChargedOn ? `最終請求 ${synced.lastChargedOn}` : '更新日未確認'}</span> : s.renewal ? <span>{synced?.renewalEstimated ? '次回目安' : '更新'} {s.renewal}</span> : <span>更新日未確認</span>}
                        <span style={{ marginLeft: 'auto' }} aria-hidden="true">›</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
      {edit && (
        <EntrySheet portal label="定期費を編集" onClose={closeEdit}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>{edit.id ? "定期費を編集" : "定期費を追加"}</div>
            {edit.subscriptionSync && <section style={{ marginBottom: 20 }} aria-label="請求の確認情報">
              <div style={{ color: MUTED, fontSize: 13, marginBottom: 8 }}>{subscriptionStatus(edit, today)}{edit.subscriptionSync.canceledOn ? ` · 解約手続き ${edit.subscriptionSync.canceledOn}` : ''}</div>
              <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>{edit.subscriptionSync.evidence.length ? '契約メールと請求実績で確認' : '請求実績から推定'}{edit.subscriptionSync.lastChargedOn ? ` · 最終請求 ${edit.subscriptionSync.lastChargedOn}` : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '7px 12px', fontSize: 13 }}>
                {edit.subscriptionSync.history.slice(-6).reverse().map(h => <React.Fragment key={`${h.id}:${h.amount}`}><span>{h.date}</span><span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{yen(h.amount)}</span></React.Fragment>)}
              </div>
            </section>}
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
                <button key={v} style={{ ...styles.kindBtn, ...(edit.cycle === v ? { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" } : {}) }} onClick={() => setEdit({ ...edit, cycle: v })}>{l}</button>
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
            <ClearableCalendarInput value={edit.renewal ?? ""} onChange={(value) => setEdit({ ...edit, renewal: value, renewalDay: value ? Number(value.slice(8, 10)) : undefined })} style={styles.textInput} />
            <div style={styles.kindRow}>
              <button style={{ ...styles.kindBtn, ...(edit.autoRenew !== false ? { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" } : {}) }} onClick={() => setEdit({ ...edit, autoRenew: true })}>{edit.cycle === "yearly" ? "毎年自動更新" : "毎月自動更新"}</button>
              <button style={{ ...styles.kindBtn, ...(edit.autoRenew === false ? { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" } : {}) }} onClick={() => setEdit({ ...edit, autoRenew: false })}>固定</button>
            </div>
            <label style={styles.fieldLabel}>開始日</label>
            <ClearableCalendarInput value={edit.startDate ?? ""} onChange={(value) => setEdit({ ...edit, startDate: value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>無料期間の終了日</label>
            <ClearableCalendarInput value={edit.trialEndDate ?? ""} onChange={(value) => setEdit({ ...edit, trialEndDate: value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>解約手続きの期限</label>
            <ClearableCalendarInput value={edit.cancelBy ?? ""} onChange={(value) => setEdit({ ...edit, cancelBy: value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>終了予定日・解約日</label>
            <ClearableCalendarInput value={edit.endDate ?? ""} onChange={(value) => setEdit({ ...edit, endDate: value })} style={styles.textInput} />
            <label style={styles.fieldLabel}>プラン名（任意）</label>
            <input value={edit.plan ?? ""} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} placeholder="例）Premium / 年間プラン" style={styles.textInput} />
            <label style={styles.fieldLabel}>メモ（任意）</label>
            <textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="解約条件や備考など" style={styles.memoTextarea} />
            <button style={{ ...styles.saveBtn, opacity: edit.name.trim() && !(edit.startDate && edit.endDate && edit.endDate < edit.startDate) ? 1 : 0.4 }} onClick={commit} disabled={!edit.name.trim() || !!(edit.startDate && edit.endDate && edit.endDate < edit.startDate)}>{edit.id ? "更新" : "追加"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={remove}>削除</button>}
            <button style={styles.cancelBtn} onClick={closeEdit}>閉じる</button>
        </EntrySheet>
      )}
    </div>
  );
}
