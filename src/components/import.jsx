import React, { useRef, useState } from "react";
import { ACCENT, MUTED, RED, GREEN } from '../theme.js';
import { parseBankText, classifyTxn, txnToEntry, uid } from '../utils';
import { styles } from '../styles.js';

// 口座記録の内訳スタイル。既定は出金/入金だが、ATMの現金引出/預入や
// 投資/ハイブリッド口座への振替など、記録したい項目名に応じて選べるようにする。
const ACCOUNT_ITEM_STYLES = [
  { id: "inout", label: "出金/入金", neg: "出金", pos: "入金" },
  { id: "cash", label: "引出/預入", neg: "引出", pos: "預入" },
  { id: "invest", label: "投資振替", neg: "投資振替", pos: "投資振替" },
];
const styleOf = (cls) => ACCOUNT_ITEM_STYLES.find((s) => s.neg === (cls.negItem || "出金") && s.pos === (cls.posItem || "入金")) || ACCOUNT_ITEM_STYLES[0];

// スクショ取込。銀行アプリなどの明細スクショをOCR(tesseract.js、取込時のみ動的読込・要通信)で
// 文字起こしし、登録済みルール(config.importRules)で自動的にentryへ振り分ける。
// OCRが誤読してもテキスト欄で修正・貼り付け直しができ、最後は必ずレビュー画面で内容を確認してから追加する。
export function ImportSheet({ cards, config, ym, onAddEntries, onSaveImportRules, onClose }) {
  const fileRef = useRef(null);
  const [rawText, setRawText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [importYm, setImportYm] = useState(ym);
  const [rows, setRows] = useState(null); // null=未解析。解析後は [{txn, cls, matchDraft}]

  const runOcr = async (file) => {
    setOcrBusy(true); setOcrError("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("jpn");
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setRawText(data.text || "");
    } catch {
      setOcrError("画像の読み取りに失敗しました。通信状況を確認するか、下の欄に直接テキストを貼り付けてください。");
    } finally {
      setOcrBusy(false);
    }
  };

  const parse = () => {
    // "N日"だけの見出し形式(年月の表記が無い)は、今表示中の月を起点に判定する
    const txns = parseBankText(rawText, importYm);
    setRows(txns.map((txn) => {
      const auto = classifyTxn(txn.desc, config.importRules);
      return { txn, cls: auto || { action: "skip" }, matchDraft: txn.desc, autoMatched: !!auto };
    }));
  };

  const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const rememberRule = (i) => {
    const r = rows[i];
    const match = (r.matchDraft || "").trim();
    if (!match || r.cls.action === "skip" || !r.cls.target) return;
    const rule = { id: uid(), match, action: r.cls.action, target: r.cls.target, negItem: r.cls.negItem, posItem: r.cls.posItem };
    onSaveImportRules([...(config.importRules || []), rule]);
  };

  const entries = (rows || []).map((r) => txnToEntry(r.txn, r.cls, config.cycleCutoffDay));
  const includedCount = entries.filter(Boolean).length;
  const commit = () => {
    const list = entries.filter(Boolean);
    if (list.length) onAddEntries(list);
    onClose();
  };

  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>スクショ取込</div>

        {!rows && (
          <>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.6 }}>
              銀行アプリなどの明細画面のスクショを選ぶと、文字を読み取って自動で仕分けます(通信が必要)。
              うまく読み取れない場合は下のテキスト欄に直接貼り付けても構いません。
            </div>
            <button style={styles.backupBtn} onClick={() => fileRef.current && fileRef.current.click()} disabled={ocrBusy}>
              {ocrBusy ? "読み取り中…" : "スクショを選ぶ"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) runOcr(f); e.target.value = ""; }} />
            {ocrError && <div style={{ fontSize: 12.5, color: RED, margin: "8px 2px 0" }}>{ocrError}</div>}
            <label style={styles.fieldLabel}>取り込む月</label>
            <input type="month" value={importYm} onChange={(e) => setImportYm(e.target.value)} style={styles.textInput} />
            <label style={styles.fieldLabel}>読み取ったテキスト(編集・貼り付け可)</label>
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="ここにテキストを直接貼り付けてもOK" style={{ ...styles.memoTextarea, minHeight: 160 }} />
            <button style={{ ...styles.saveBtn, opacity: rawText.trim() ? 1 : 0.4 }} disabled={!rawText.trim()} onClick={parse}>解析する</button>
            <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
          </>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 12, color: MUTED, margin: "0 2px 12px" }}>{rows.length}件を検出しました。内容を確認して「追加する」を押してください。</div>
            {rows.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 10 }}>取引を検出できませんでした。テキストを見直してください。</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r, i) => {
                const entry = entries[i];
                const needsTarget = r.cls.action !== "skip" && !r.cls.target;
                return (
                  <div key={i} style={{ ...styles.detailCard, opacity: entry ? 1 : 0.55 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 2px", gap: 8 }}>
                      <span style={{ fontSize: 12.5, color: MUTED, flexShrink: 0 }}>{r.txn.date}</span>
                      <input type="number" inputMode="numeric" value={r.txn.amount}
                        onChange={(e) => setRow(i, { txn: { ...r.txn, amount: e.target.value === "" ? 0 : Number(e.target.value) } })}
                        style={{ ...styles.textInput, width: 120, textAlign: "right", padding: "5px 8px", fontSize: 14.5, fontWeight: 600, color: r.txn.amount < 0 ? RED : GREEN }} />
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, textAlign: "right", marginBottom: 4 }}>OCRの誤読があれば金額を直接修正できます</div>
                    <div style={{ fontSize: 13, marginBottom: 8, wordBreak: "break-all" }}>{r.txn.desc || "(摘要なし)"}</div>
                    <div style={styles.optionRow}>
                      {[["skip", "取り込まない"], ["card", "カード"], ["account", "口座"]].map(([v, l]) => (
                        <button key={v} style={{ ...styles.optionChip, ...(r.cls.action === v ? styles.optionChipActive : {}) }}
                          onClick={() => setRow(i, { cls: { action: v, target: v === r.cls.action ? r.cls.target : undefined } })}>{l}</button>
                      ))}
                    </div>
                    {r.cls.action === "card" && (
                      <div style={styles.optionRow}>
                        {(cards || []).map((c) => (
                          <button key={c.id} style={{ ...styles.optionChip, ...(r.cls.target === c.name ? styles.optionChipActive : {}) }}
                            onClick={() => setRow(i, { cls: { ...r.cls, target: c.name } })}>{c.name}</button>
                        ))}
                      </div>
                    )}
                    {r.cls.action === "account" && (
                      <>
                        <div style={styles.optionRow}>
                          {(config.accounts || []).map((a) => (
                            <button key={a} style={{ ...styles.optionChip, ...(r.cls.target === a ? styles.optionChipActive : {}) }}
                              onClick={() => setRow(i, { cls: { ...r.cls, target: a } })}>{a}</button>
                          ))}
                        </div>
                        <div style={styles.optionRow}>
                          {ACCOUNT_ITEM_STYLES.map((s) => (
                            <button key={s.id} style={{ ...styles.optionChip, ...(styleOf(r.cls).id === s.id ? styles.optionChipActive : {}) }}
                              onClick={() => setRow(i, { cls: { ...r.cls, negItem: s.neg, posItem: s.pos } })}>{s.label}</button>
                          ))}
                        </div>
                        {entry && <div style={{ fontSize: 11.5, color: MUTED, margin: "2px 2px 0" }}>「{entry.item}」として記録されます</div>}
                      </>
                    )}
                    {needsTarget && <div style={{ fontSize: 11.5, color: RED, marginTop: 2 }}>{r.cls.action === "card" ? "カード" : "口座"}を選んでください</div>}
                    {!r.autoMatched && r.cls.action !== "skip" && r.cls.target && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid var(--line)` }}>
                        <input value={r.matchDraft} onChange={(e) => setRow(i, { matchDraft: e.target.value })} style={{ ...styles.textInput, fontSize: 12.5, padding: "7px 10px", marginBottom: 6 }} placeholder="判定キーワード" />
                        <button style={styles.chipGhost} onClick={() => rememberRule(i)}>次回からこのキーワードで自動判定する</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button style={{ ...styles.saveBtn, opacity: includedCount ? 1 : 0.4 }} disabled={!includedCount} onClick={commit}>{includedCount}件を追加する</button>
            <button style={styles.cancelBtn} onClick={() => setRows(null)}>やり直す</button>
            <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
          </>
        )}
      </div>
    </div>
  );
}
