import React, { useState, useMemo } from "react";
import { MUTED } from '../theme.js';
import { yen, uid } from '../utils.js';
import { styles } from '../styles.js';
import { Subs } from './subs.jsx';

// メモタブ。「メモ(自由メモ・カテゴリ別小計)」と「サブスク(定期支払い管理)」の切替。
// いずれも収支計算(entries/computeSummary)とは無関係の独立データ。
export function MemoTab({ memos, onSaveMemos, subs, onSaveSubs, cards }) {
  const [view, setView] = useState("memo");
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.viewToggle}>
        <button style={{ ...styles.viewToggleBtn, ...(view === "memo" ? styles.viewToggleActive : {}) }} onClick={() => setView("memo")}>メモ</button>
        <button style={{ ...styles.viewToggleBtn, ...(view === "subs" ? styles.viewToggleActive : {}) }} onClick={() => setView("subs")}>サブスク</button>
      </div>
      {view === "memo" ? <MemoList memos={memos} onSave={onSaveMemos} /> : <Subs subs={subs} onSave={onSaveSubs} cards={cards} />}
    </div>
  );
}

function MemoList({ memos, onSave }) {
  const [edit, setEdit] = useState(null);
  const cats = useMemo(() => Array.from(new Set(memos.map((m) => (m.category || "").trim()).filter(Boolean))), [memos]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const m of memos) { const k = (m.category || "").trim() || "その他"; if (!map.has(k)) map.set(k, []); map.get(k).push(m); }
    return Array.from(map.entries());
  }, [memos]);
  const commit = () => {
    if (!edit.title.trim()) return;
    const m = { ...edit, title: edit.title.trim(), category: (edit.category || "").trim(), amount: Number(edit.amount) || 0 };
    const next = edit.id ? memos.map((x) => (x.id === edit.id ? m : x)) : [...memos, { ...m, id: uid() }];
    onSave(next); setEdit(null);
  };
  const remove = () => { onSave(memos.filter((x) => x.id !== edit.id)); setEdit(null); };
  return (
    <div>
      <div style={styles.detailHead}><span>メモ（{memos.length}）</span><button style={styles.addBtn} onClick={() => setEdit({ title: "", amount: "", body: "", category: "" })}>＋ 追加</button></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 10px" }}>収支には計上されない自由メモ。カテゴリごとに合計を表示します。</div>
      {memos.length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>まだメモがありません。「＋ 追加」から作成できます。</div></div>
      ) : (
        groups.map(([cat, items]) => {
          const sum = items.reduce((a, m) => a + (Number(m.amount) || 0), 0);
          return (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={styles.memoGroupHead}><span>{cat} 合計</span><span style={styles.memoGroupSum}>{yen(sum)}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((m) => (
                  <button key={m.id} style={styles.memoCard} onClick={() => setEdit({ ...m, amount: m.amount ? String(m.amount) : "", category: m.category || "" })}>
                    <div style={styles.memoHead}>
                      <span style={styles.memoTitle}>{m.title}</span>
                      {Number(m.amount) > 0 && <span style={styles.memoAmount}>{yen(m.amount)}</span>}
                    </div>
                    {m.body && <div style={styles.memoBody}>{m.body}</div>}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>{edit.id ? "メモを編集" : "メモを追加"}</div>
            <label style={styles.fieldLabel}>タイトル</label>
            <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="例）飲み会 / プレゼント" style={styles.textInput} autoFocus />
            <label style={styles.fieldLabel}>カテゴリ（任意・合計をまとめる単位）</label>
            {cats.length > 0 && <div style={styles.optionRow}>{cats.map((c) => <button key={c} style={{ ...styles.optionChip, ...(edit.category === c ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, category: c })}>{c}</button>)}</div>}
            <input value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="例）交際費" style={styles.textInput} />
            <label style={styles.fieldLabel}>金額（円・任意）</label>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="0" style={styles.amountInput} /></div>
            <label style={styles.fieldLabel}>内容（任意）</label>
            <textarea value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder="自由記述" style={styles.memoTextarea} />
            <button style={{ ...styles.saveBtn, opacity: edit.title.trim() ? 1 : 0.4 }} onClick={commit} disabled={!edit.title.trim()}>{edit.id ? "更新する" : "追加する"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={remove}>このメモを削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
