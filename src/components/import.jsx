import React, { useRef, useState } from "react";
import { ACCENT, MUTED, RED, GREEN } from '../theme.js';
import { parseBankText, parseBankCsv, classifyTxn, txnToEntry, uid, yen, cycleYm, matchesOwnName, pairOwnTransfers } from '../utils';
import { styles } from '../styles.js';

// CSVは銀行によってUTF-8とShift_JISが混在する。置換文字(U+FFFD)が出たらShift_JISで読み直す。
async function readCsvText(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("shift_jis").decode(buf); } catch { return utf8; }
}

// このCSVがどの口座/カードのものかを推定する。1ファイル=1口座なので、当たれば全行に適用できる。
// 判定材料はファイル名 →(無ければ)ヘッダー行より前の前書き のみ。
// 取引明細の本文は見ない: 銀行CSVの摘要に「カード引落 SMCC」等が出るため、カード名に誤爆する。
// 残高列があるCSVは口座の明細なので、口座を先に照合する。
const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s　_\-（）()]/g, "");
export function guessCsvTarget(fileName, preamble, cards, accounts, preferAccount) {
  const cardHits = (hay) => (cards || []).map((c) => c.name).filter((n) => norm(n) && hay.includes(norm(n)));
  const acctHits = (hay) => (accounts || []).filter((a) => norm(a) && hay.includes(norm(a)));
  const pick = (hay) => {
    if (!hay) return null;
    const cs = cardHits(hay), as = acctHits(hay);
    // 候補が複数なら断定しない(利用者に選ばせる)
    const card = cs.length === 1 ? { action: "card", target: cs[0] } : null;
    const acct = as.length === 1 ? { action: "account", target: as[0] } : null;
    if (preferAccount) return acct || card;
    return card || acct;
  };
  return pick(norm(fileName)) || pick(norm(String(preamble || "")));
}

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
export function ImportSheet({ cards, config, ym, entries: existing, initialText, onAddEntries, onSaveImportRules, onClose }) {
  const fileRef = useRef(null);
  const csvRef = useRef(null);
  const [rawText, setRawText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [importYm, setImportYm] = useState(ym);
  const [rows, setRows] = useState(null); // null=未解析。解析後は [{txn, cls, matchDraft}]
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvNotes, setCsvNotes] = useState([]);   // ファイルごとの取込結果(件数・推定先・残高)
  const [balances, setBalances] = useState([]);   // CSVの残高列から拾った月末残高

  // 1行の振り分けを決める。優先順位は
  //   1. 摘要のルール(自分名義の送金=skip、ハイブリッド=投資振替、ATM=引出/預入、カード引落=カード…)
  //   2. ルールに当たらなければ、ファイル単位で推定した口座の出金/入金
  // ルールが「口座」でも振り分け先が未設定なら、そのファイルの口座で補う。
  // ファイル推定をルールより優先すると、投資振替や自分名義の送金が全部ただの出金になってしまう。
  const classifyRow = (txn, guess) => {
    const byRule = classifyTxn(txn.desc, config.importRules);
    if (byRule) {
      // 口座の記録なら、どの口座かはファイル(=1口座)が正しい。ルールは項目(出金/引出/投資振替)だけ決める。
      // ルールのtargetを優先すると、ゆうちょのCSVがNEOBANK宛のルールに引っ張られてしまう。
      if (byRule.action === "account" && guess && guess.action === "account") return { ...byRule, target: guess.target };
      return byRule;
    }
    return guess || null;
  };

  // CSVを複数まとめて取り込む。ファイルごとに口座/カードを推定し、
  // ルールに当たらない行の振り分け先として使う(1ファイル=1口座なので取り違えが起きない)。
  const runCsv = async (files) => {
    setCsvBusy(true); setOcrError("");
    const allRows = [], notes = [], bals = [];
    for (const file of files) {
      try {
        const text = await readCsvText(file);
        const res = parseBankCsv(text);
        if (res.error && res.txns.length === 0) { notes.push({ name: file.name, error: res.error }); continue; }
        const guess = guessCsvTarget(file.name, res.preamble, cards, config.accounts, !!res.balance);
        const fileIdx = notes.length;
        for (const txn of res.txns) {
          const auto = classifyRow(txn, guess);
          allRows.push({ txn, cls: auto || { action: "skip" }, matchDraft: txn.desc, autoMatched: !!auto, fileIdx,
            own: matchesOwnName(txn.desc, config.ownTransferKeywords) });
        }
        if (res.balance) bals.push({ account: guess && guess.action === "account" ? guess.target : "", fileIdx, ...res.balance });
        notes.push({ name: file.name, count: res.txns.length, target: guess ? guess.target : null, balance: res.balance, check: res.balanceCheck });
      } catch (e) {
        notes.push({ name: file.name, error: "読み取りに失敗しました" });
      }
    }
    setCsvNotes(notes); setBalances(bals);
    if (allRows.length > 0) setRows(applyTransferPairs(allRows));
    else setOcrError("CSVから取引を読み取れませんでした。別の形式かもしれません。");
    setCsvBusy(false);
  };

  // 自分名義の取引どうしを突き合わせ、組になったもの(=口座間の振替)は収支に計上しない。
  // 相手が見つからなかったものは実際のやり取りかもしれないので、そのまま残して画面で知らせる。
  const applyTransferPairs = (list) => {
    const partner = pairOwnTransfers(list.map((r) => ({ date: r.txn.date, amount: r.txn.amount, group: r.fileIdx, own: !!r.own })));
    return list.map((r, i) => (partner[i] >= 0
      ? { ...r, cls: { action: "skip" }, autoMatched: true, transferWith: list[partner[i]].fileIdx }
      : r));
  };

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

  // 1つのテキスト(CSV)を取り込む。ショートカット経由(URL)・クリップボード・貼り付けで共用する。
  // CSVとして読めなければ明細テキストとして扱う。
  const ingestText = (text, label) => {
    if (!String(text || "").trim()) { setOcrError("中身が空でした。"); return false; }
    const res = parseBankCsv(text);
    if (res.txns.length > 0) {
      const guess = guessCsvTarget("", res.preamble, cards, config.accounts, !!res.balance);
      setRows(res.txns.map((txn) => {
        const auto = classifyRow(txn, guess);
        return { txn, cls: auto || { action: "skip" }, matchDraft: txn.desc, autoMatched: !!auto };
      }));
      setCsvNotes([{ name: label, count: res.txns.length, target: guess ? guess.target : null, balance: res.balance, check: res.balanceCheck }]);
      setBalances(res.balance && guess && guess.action === "account" ? [{ account: guess.target, ...res.balance }] : []);
      setOcrError("");
      return true;
    }
    setRawText(text);
    setOcrError("CSVとして読み取れなかったので、テキストとして読み込みました。下の「解析する」を押してください。");
    return false;
  };

  // ショートカットからURLで渡されたCSVを、開いた直後に自動で解析する
  const bootRef = useRef(false);
  React.useEffect(() => {
    if (bootRef.current || !initialText) return;
    bootRef.current = true;
    ingestText(initialText, "ショートカット");
  }, [initialText]);

  // クリップボードから直接取り込む。iOSはPWAを共有シートに出せない(Web Share Target未対応)ため、
  // 「CSVをコピー → ここを1タップ」が確実に動く導線になる。
  const runClipboard = async () => {
    setOcrError("");
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setOcrError("クリップボードを読み取れませんでした。下のテキスト欄に貼り付けてください。");
      return;
    }
    ingestText(text, "クリップボード");
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

  // ファイル単位で口座をまとめて指定する。1ファイル=1口座なので、
  // 自動判定できなかったCSV(前書きに銀行名が無いゆうちょ等)でも1回選ぶだけで全行に反映できる。
  const setFileAccount = (fileIdx, account) => {
    setCsvNotes((prev) => prev.map((n, i) => (i === fileIdx ? { ...n, target: account } : n)));
    setRows((prev) => prev.map((r) => {
      if (r.fileIdx !== fileIdx) return r;
      // 口座の記録は宛先をこのファイルの口座に揃える
      if (r.cls.action === "account") return { ...r, cls: { ...r.cls, target: account } };
      // ルールに当たらず宙に浮いていた行(給与・送金など)も、この口座の出金/入金として取り込む。
      // 利用者が自分で「取り込まない」にした行や、自分名義として除外された行(autoMatched)は触らない。
      if (!r.autoMatched && r.cls.action === "skip") return { ...r, cls: { action: "account", target: account } };
      return r;
    }));
    setBalances((prev) => prev.map((b) => (b.fileIdx === fileIdx ? { ...b, account } : b)));
  };

  const rememberRule = (i) => {
    const r = rows[i];
    const match = (r.matchDraft || "").trim();
    if (!match || r.cls.action === "skip" || !r.cls.target) return;
    const rule = { id: uid(), match, action: r.cls.action, target: r.cls.target, negItem: r.cls.negItem, posItem: r.cls.posItem };
    onSaveImportRules([...(config.importRules || []), rule]);
  };

  // 取込済みの明細の指紋。CSVの期間が重なっても同じ取引を二重に登録しないため、
  // 既に同じ指紋の記録があるものは取り込み対象から外す。
  const existingKeys = React.useMemo(() => new Set((existing || []).map((e) => e.src).filter(Boolean)), [existing]);
  const entries = (rows || []).map((r) => txnToEntry(r.txn, r.cls, config.cycleCutoffDay));
  const dupFlags = entries.map((e) => !!(e && e.src && existingKeys.has(e.src)));
  const dupCount = dupFlags.filter(Boolean).length;
  const newEntries = entries.filter((e, i) => e && !dupFlags[i]);
  const includedCount = newEntries.length;
  // CSVの残高列から拾った月末残高も一緒に登録する(残高の手入力が不要になる)。
  // 残高は同じ月・口座で1件だけ持つべきなので、追加ではなく置き換える(App側で差し替え)。
  const balEntries = balances.filter((b) => b.account).map((b) => ({ ym: cycleYm(b.date, config.cycleCutoffDay), cat: "account", item: "残高", account: b.account, amount: Math.round(b.amount) }));
  const commit = () => {
    const list = [...newEntries, ...balEntries];
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
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.6 }}>
              <b>CSVがいちばん確実です。</b>銀行・カードのサイトで明細CSVを保存してから選んでください
              （複数まとめて選べます。iPhoneはファイル選択の「最近使った項目」に出ます）。
              金額の誤読がなく、残高も自動で取り込みます。
            </div>
            <button style={{ ...styles.saveBtn, marginTop: 0 }} onClick={() => csvRef.current && csvRef.current.click()} disabled={csvBusy}>
              {csvBusy ? "読み取り中…" : "CSVを選ぶ（複数可）"}
            </button>
            <input ref={csvRef} type="file" accept=".csv,.txt,text/csv,text/plain" multiple style={{ display: "none" }}
              onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) runCsv(f); e.target.value = ""; }} />
            <button style={{ ...styles.backupBtn, marginTop: 8 }} onClick={runClipboard}>クリップボードから取り込む</button>
            <div style={{ fontSize: 11.5, color: MUTED, margin: "6px 2px 0", lineHeight: 1.6 }}>
              CSVの中身をコピーしてからこれを押せば、ファイル保存なしで取り込めます。
            </div>
            {csvNotes.length > 0 && (
              <div style={{ margin: "10px 2px 0" }}>
                {csvNotes.map((n, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: n.error ? RED : MUTED, padding: "2px 0" }}>
                    {n.name}：{n.error ? n.error : `${n.count}件${n.target ? ` → ${n.target}` : "（振り分け先は下で選んでください）"}${n.balance ? ` / 残高 ${yen(n.balance.amount)}` : ""}`}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: MUTED, margin: "16px 0 8px", lineHeight: 1.6, paddingTop: 12, borderTop: `1px solid var(--line)` }}>
              CSVが用意できない時は、明細画面のスクショからも読み取れます（誤読が出ることがあります）。
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
            {(() => {
              const pairs = (rows || []).filter((r) => r.transferWith != null).length;
              const lonely = (rows || []).filter((r) => r.own && r.transferWith == null).length;
              if (!pairs && !lonely) return null;
              return (
                <>
                  {pairs > 0 && <div style={{ ...styles.flash, background: "var(--group-bg)", color: MUTED }}>口座間の振替として{pairs}件を除きます（同日・同額・逆向きの組が揃ったもの）</div>}
                  {lonely > 0 && <div style={{ ...styles.flash, background: "var(--expense-soft)", color: RED }}>自分名義だが相手が見つからない記録が{lonely}件あります。両方の口座のCSVを一緒に取り込むと自動で振替になります</div>}
                </>
              );
            })()}
            {dupCount > 0 && (
              <div style={{ ...styles.flash, background: "var(--group-bg)", color: MUTED }}>
                取込済みの{dupCount}件は除きます（同じ明細を二重に登録しません）
              </div>
            )}
            {/* ファイルごとの口座。1ファイル=1口座なので、ここで選べば全行に反映される。 */}
            {csvNotes.filter((n) => !n.error).map((n, i) => (
              <div key={i} style={{ ...styles.detailCard, marginBottom: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, color: MUTED, wordBreak: "break-all", marginBottom: 6 }}>{n.name}（{n.count}件）</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: n.target ? MUTED : RED }}>{n.target ? "この明細の口座" : "口座を選んでください"}</span>
                  <select value={n.target || ""} onChange={(e) => setFileAccount(i, e.target.value)} style={{ ...styles.textInput, width: "auto", margin: 0, padding: "6px 8px", fontSize: 13 }}>
                    <option value="">（未選択）</option>
                    {(config.accounts || []).map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {/* 残高での検算。CSVの残高列が「手前の残高＋取引＝その行の残高」で繋がるかを見て、
                読み取り違いや取りこぼしが無いことを取り込む前に確かめられるようにする。 */}
            {csvNotes.filter((n) => n.check).map((n, i) => (
              <div key={i} style={{ ...styles.flash, background: n.check.mismatched ? "var(--expense-soft)" : "var(--group-bg)", color: n.check.mismatched ? RED : MUTED }}>
                {n.check.mismatched === 0
                  ? `✓ 残高で検算：${n.check.checked}件すべて計算が合いました${n.balance ? `（最終残高 ${yen(n.balance.amount)}）` : ""}`
                  : `⚠ 残高が合わない箇所が${n.check.mismatched}件あります（読み取り違い・取りこぼしの可能性）${n.check.firstMismatch ? `／最初の不一致：${n.check.firstMismatch.date} ${n.check.firstMismatch.desc.slice(0, 16)} 期待 ${yen(n.check.firstMismatch.expected)} → 実際 ${yen(n.check.firstMismatch.actual)}` : ""}`}
              </div>
            ))}
            {balEntries.length > 0 && (
              <div style={{ ...styles.detailCard, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, padding: "8px 2px 4px" }}>CSVから読み取った残高（一緒に登録します）</div>
                {balEntries.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 2px" }}>
                    <span style={{ color: MUTED }}>{b.account}</span><span>{yen(b.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {rows.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 10 }}>取引を検出できませんでした。テキストを見直してください。</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r, i) => {
                const entry = entries[i];
                const isDup = dupFlags[i];
                const needsTarget = r.cls.action !== "skip" && !r.cls.target;
                return (
                  <div key={i} style={{ ...styles.detailCard, opacity: entry && !isDup ? 1 : 0.55 }}>
                    {isDup && <div style={{ fontSize: 11, color: MUTED, padding: "6px 2px 0" }}>取込済み（重複のため登録しません）</div>}
                    {r.transferWith != null && (
                      <div style={{ fontSize: 11, color: ACCENT, padding: "6px 2px 0" }}>
                        口座間の振替（{csvNotes[r.transferWith] ? (csvNotes[r.transferWith].target || csvNotes[r.transferWith].name) : "別の口座"}と同額・同日の反対の記録あり）。収支には入れません
                      </div>
                    )}
                    {r.own && r.transferWith == null && (
                      <div style={{ fontSize: 11, color: RED, padding: "6px 2px 0" }}>
                        自分名義ですが反対側の記録が見つかりません。口座間の振替なら「取り込まない」にしてください
                      </div>
                    )}
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
            <button style={{ ...styles.saveBtn, opacity: (includedCount || balEntries.length) ? 1 : 0.4 }} disabled={!includedCount && !balEntries.length} onClick={commit}>
              {includedCount}件を追加する{balEntries.length > 0 ? `（残高${balEntries.length}件も）` : ""}
            </button>
            <button style={styles.cancelBtn} onClick={() => setRows(null)}>やり直す</button>
            <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
          </>
        )}
      </div>
    </div>
  );
}
