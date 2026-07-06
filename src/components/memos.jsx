import React, { useState } from "react";
import { MUTED } from '../theme.js';
import { yen, uid } from '../utils.js';
import { styles } from '../styles.js';

// 収支計算とは無関係の自由メモ。サブスク・交際費など「いくら使ったか」の覚え書き用。
// entries とは別の storage キー(memos)で保存し、サマリ等の集計には一切影響しない。
export function Memos({ memos, onSave }) {
  const [edit, setEdit] = useState(null);
  const commit = () => {
    if (!edit.title.trim()) return;
    const m = { ...edit, title: edit.title.trim(), amount: Number(edit.amount) || 0 };
    const next = edit.id ? memos.map((x) => (x.id === edit.id ? m : x)) : [...memos, { ...m, id: uid() }];
    onSave(next); setEdit(null);
  };
  const remove = () => { onSave(memos.filter((x) => x.id !== edit.id)); setEdit(null); };
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={styles.detailHead}><span>メモ（{memos.length}）</span><button style={styles.addBtn} onClick={() => setEdit({ title: "", amount: "", body: "" })}>＋ 追加</button></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 10px" }}>収支には計上されない自由メモ。サブスク・交際費などの記録に。</div>
      {memos.length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>まだメモがありません。「＋ 追加」から作成できます。</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {memos.map((m) => (
            <button key={m.id} style={styles.memoCard} onClick={() => setEdit({ ...m, amount: m.amount ? String(m.amount) : "" })}>
              <div style={styles.memoHead}>
                <span style={styles.memoTitle}>{m.title}</span>
                {Number(m.amount) > 0 && <span style={styles.memoAmount}>{yen(m.amount)}</span>}
              </div>
              {m.body && <div style={styles.memoBody}>{m.body}</div>}
            </button>
          ))}
        </div>
      )}
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>{edit.id ? "メモを編集" : "メモを追加"}</div>
            <label style={styles.fieldLabel}>タイトル</label>
            <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="例）サブスク / 交際費" style={styles.textInput} autoFocus />
            <label style={styles.fieldLabel}>金額（円・任意）</label>
            <div style={styles.amountWrap}><span style={styles.yenMark}>¥</span><input type="number" inputMode="numeric" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="0" style={styles.amountInput} /></div>
            <label style={styles.fieldLabel}>内容（任意）</label>
            <textarea value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder="例）Netflix ¥1,490 / Spotify ¥980 …" style={styles.memoTextarea} />
            <button style={{ ...styles.saveBtn, opacity: edit.title.trim() ? 1 : 0.4 }} onClick={commit} disabled={!edit.title.trim()}>{edit.id ? "更新する" : "追加する"}</button>
            {edit.id && <button style={styles.deleteBtn} onClick={remove}>このメモを削除</button>}
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
