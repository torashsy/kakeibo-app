import React, { useRef, useState } from "react";
import { ACCENT, MUTED, RED, GREEN } from '../theme.js';
import { parseBankText, parseBankCsv, classifyTxnForImport, txnToEntry, txnKey, txnBalanceKey, dedupeTxns, guessYuchoScreenshotAccount, uid, yen, cycleYm, cycleStartDate, periodLabel, addMonth, verifyOcrBalanceChain, verifyBalanceTotal, cardMonthTotal, DEBIT_HINT_RE, guessCardForDebit, matchesOwnName, pairOwnTransfers, parseTxnKey, decodeImportPayload, INTERNAL_TRANSFER_ITEM } from '../utils';
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
// OCR結果は明細へ整形して表示し、最後は必ずレビュー画面で内容を確認してから追加する。
export function ImportSheet({ cards, config, ym, entries: existing, initialText, initialMode, onAddEntries, onSaveImportRules, onSaveConfig, onClose }) {
  const fileRef = useRef(null);
  const csvRef = useRef(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrError, setOcrError] = useState("");
  const [rows, setRows] = useState(null); // null=未解析。解析後は [{txn, cls, matchDraft}]
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvNotes, setCsvNotes] = useState([]);   // ファイルごとの取込結果(件数・推定先・残高)
  const [balances, setBalances] = useState([]);   // CSVの残高列から拾った月末残高
  const [ocrMode, setOcrMode] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingYm, setOpeningYm] = useState("");   // 開始残高がどの月度末のものか
  const ocrStartDate = cycleStartDate(ym, config.cycleCutoffDay);
  const initialPickerOpened = useRef(false);

  // トップのCSV/スクショから来た場合は、そのタップのまま対応する選択画面を開く。
  React.useLayoutEffect(() => {
    if (initialPickerOpened.current) return;
    initialPickerOpened.current = true;
    if (initialMode === "csv") csvRef.current?.click();
    if (initialMode === "screenshot") fileRef.current?.click();
  }, [initialMode]);

  // iPhoneのショートカットは公開版を開く。開発中のlocalhostをコピーすると
  // iPhoneから到達できないため、ローカル表示中だけ本番URLへ差し替える。
  const shortcutAppUrl = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? "https://torashsy.github.io/kakeibo-app/"
    : (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "https://torashsy.github.io/kakeibo-app/");
  const shortcutPrefix = `${shortcutAppUrl}#import64=`;


  // 1行の振り分けを決める。優先順位は
  //   1. 摘要のルール(自分名義の送金=skip、ハイブリッド=投資振替、ATM=引出/預入、カード引落=カード…)
  //   2. ルールに当たらなければ、ファイル単位で推定した口座の出金/入金
  // ルールが「口座」でも振り分け先が未設定なら、そのファイルの口座で補う。
  // ファイル推定をルールより優先すると、投資振替や自分名義の送金が全部ただの出金になってしまう。
  const classifyRow = (txn, guess) => {
    return classifyTxnForImport(txn.desc, config.importRules, guess || null);
  };

  // CSVを複数まとめて取り込む。ファイルごとに口座/カードを推定し、
  // ルールに当たらない行の振り分け先として使う(1ファイル=1口座なので取り違えが起きない)。
  const runCsv = async (files) => {
    setCsvBusy(true); setOcrError("");
    setOcrMode(false); setOpeningBalance("");
    const allRows = [], notes = [], bals = [];
    for (const file of files) {
      try {
        const text = await readCsvText(file);
        const res = parseBankCsv(text);
        if (res.error && res.txns.length === 0) { notes.push({ name: file.name, error: res.error }); continue; }
        // 一度選んだ口座を覚えているCSVは、それを使う(2回目からは選び直し不要)
        const remembered = res.signature && (config.csvAccountMap || {})[res.signature];
        const guess = (remembered ? { action: "account", target: remembered } : null)
          || guessCsvTarget(file.name, res.preamble, cards, config.accounts, !!res.balance);
        const fileIdx = notes.length;
        for (const txn of res.txns) {
          const auto = classifyRow(txn, guess);
          allRows.push({ txn, cls: auto || { action: "skip" }, matchDraft: txn.desc, autoMatched: !!auto, fileIdx,
            own: matchesOwnName(txn.desc, config.ownTransferKeywords) });
        }
        if (res.balance) bals.push({ account: guess && guess.action === "account" ? guess.target : "", fileIdx, ...res.balance });
        notes.push({ name: file.name, count: res.txns.length, target: guess ? guess.target : null, balance: res.balance, check: res.balanceCheck, signature: res.signature });
      } catch (e) {
        notes.push({ name: file.name, error: "読み取りに失敗しました" });
      }
    }
    setCsvNotes(notes); setBalances(bals);
    if (allRows.length > 0) setRows(allRows);
    else setOcrError("CSVから取引を読み取れませんでした。別の形式かもしれません。");
    setCsvBusy(false);
  };

  const runOcr = async (files) => {
    setOcrBusy(true); setOcrError("");
    setCsvNotes([]); setBalances([]);
    let worker = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("jpn");
      const texts = [], allTxns = [];
      for (let i = 0; i < files.length; i++) {
        setOcrProgress(`${i + 1}/${files.length}`);
        const { data } = await worker.recognize(files[i]);
        const text = data.text || "";
        texts.push(text);
        allTxns.push(...parseBankText(text, ym));
      }
      const combined = texts.join("\n\n");
      // 月をまたぐスクショもそのまま扱う。各取引は自分の日付から月度へ振り分けられるので、
      // 表示中の月度で切り捨てない(以前は開始日より前を捨てていて、前月分が取り込めなかった)。
      const periodTxns = dedupeTxns(allTxns);
      const unique = periodTxns;
      const target = guessYuchoScreenshotAccount(combined, config.accounts);
      const guess = target ? { action: "account", target } : null;
      if (periodTxns.length > 0) {
        setOcrMode(true);
        setRows(periodTxns.map((txn) => {
          const auto = classifyRow(txn, guess);
          return { txn, cls: auto || { action: "skip" }, matchDraft: txn.desc, autoMatched: !!auto, fileIdx: 0 };
        }));
        // どの月度に何件入るかを見せる(月をまたいだ取込でも行き先が分かるように)
        const byPeriod = {};
        for (const t of periodTxns) { const k = cycleYm(t.date, config.cycleCutoffDay); byPeriod[k] = (byPeriod[k] || 0) + 1; }
        setCsvNotes([{ name: `スクショ ${files.length}枚`, count: periodTxns.length, target, duplicateCount: allTxns.length - periodTxns.length, periods: Object.entries(byPeriod).sort() }]);
        // 開始残高は「取り込む最初の月度の、ひとつ前の月度末の残高」。
        // 月をまたぐ取込では表示中の月ではなく、実際に取り込む最初の月度を基準にする。
        const firstYm = cycleYm([...periodTxns].sort((a, b) => a.date.localeCompare(b.date))[0].date, config.cycleCutoffDay);
        const previousYm = addMonth(firstYm, -1);
        const savedOpening = (existing || []).find((e) => e.ym === previousYm && e.cat === "account" && e.item === "残高" && e.account === target);
        setOpeningBalance(savedOpening ? String(savedOpening.amount) : "");
        setOpeningYm(previousYm);
      } else {
        setOcrError("取引を読み取れませんでした。");
      }
    } catch {
      setOcrError("画像の読み取りに失敗しました。");
    } finally {
      if (worker) { try { await worker.terminate(); } catch {} }
      setOcrBusy(false); setOcrProgress("");
    }
  };

  // 1つのテキスト(CSV)を取り込む。ショートカット経由(URL)からの受け取りで使う。
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
    const looksUrl = /^https?:\/\//.test(String(text).trim());
    setOcrError(looksUrl
      ? "CSVではなくURLが渡されています。CSVファイル本体を共有してください。"
      : "CSVとして読み取れませんでした。");
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

  const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // ファイル単位で口座をまとめて指定する。1ファイル=1口座なので、
  // 自動判定できなかったCSV(前書きに銀行名が無いゆうちょ等)でも1回選ぶだけで全行に反映できる。
  const setFileAccount = (fileIdx, account) => {
    // 次回の取り込みでは選ばなくて済むように、この明細の目印と口座の対応を覚える
    const sig = csvNotes[fileIdx] && csvNotes[fileIdx].signature;
    if (sig && account && onSaveConfig) onSaveConfig({ ...config, csvAccountMap: { ...(config.csvAccountMap || {}), [sig]: account } });
    setCsvNotes((prev) => prev.map((n, i) => (i === fileIdx ? { ...n, target: account } : n)));
    setRows((prev) => prev.map((r) => {
      if (r.fileIdx !== fileIdx) return r;
      // 自動判定済みの行は、取込元が口座だと確定した時点で再判定する。
      // これによりカード引落は「取り込まない」、口座振替は選んだ口座へ揃う。
      if (r.autoMatched) {
        const auto = classifyRow(r.txn, account ? { action: "account", target: account } : null);
        return { ...r, cls: auto || { action: "skip" } };
      }
      // 口座の記録は宛先をこのファイルの口座に揃える
      if (r.cls.action === "account") return { ...r, cls: { ...r.cls, target: account } };
      // ルールに当たらず宙に浮いていた行(給与・送金など)も、この口座の出金/入金として取り込む。
      // 利用者が自分で「取り込まない」にした行や、自分名義として除外された行(autoMatched)は触らない。
      if (!r.autoMatched && r.cls.action === "skip") return { ...r, cls: { action: "account", target: account } };
      return r;
    }));
    setBalances((prev) => prev.map((b) => (b.fileIdx === fileIdx ? { ...b, account } : b)));
    if (ocrMode && account) {
      const savedOpening = (existing || []).find((e) => e.ym === addMonth(ym, -1) && e.cat === "account" && e.item === "残高" && e.account === account);
      if (savedOpening) setOpeningBalance(String(savedOpening.amount));
    }
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
  const existingByBase = React.useMemo(() => {
    const map = new Map();
    for (const e of (existing || [])) {
      if (!e.src) continue;
      if (!map.has(e.src)) map.set(e.src, []);
      map.get(e.src).push(e);
    }
    return map;
  }, [existing]);
  const existingBalanceKeys = React.useMemo(() => {
    const keys = new Set();
    for (const e of (existing || [])) {
      const parsed = parseTxnKey(e.src);
      if (!parsed || !Number.isFinite(e.srcBalance)) continue;
      keys.add(txnBalanceKey({ ...parsed, balance: e.srcBalance }));
    }
    return keys;
  }, [existing]);
  const isExistingTxn = React.useCallback((txn) => {
    const strong = txnBalanceKey(txn);
    if (!strong) return existingKeys.has(txnKey(txn));
    if (existingBalanceKeys.has(strong)) return true;
    // 旧版の記録にはOCR残高が無いので、従来の指紋が一致した場合だけ互換判定する。
    return (existingByBase.get(txnKey(txn)) || []).some((e) => !Number.isFinite(e.srcBalance));
  }, [existingKeys, existingBalanceKeys, existingByBase]);

  // 口座間の振替の判定。今回のCSVどうしだけでなく、過去に取り込んだ記録とも突き合わせる。
  // これにより、両方の口座のCSVを同時に選ばなくても(別々の日に取り込んでも)振替として扱える。
  // 過去の記録は日付を持たないので、指紋(src)から日付・金額・摘要を復元して照合する。
  const pairing = React.useMemo(() => {
    const list = rows || [];
    const own = config.ownTransferKeywords;
    // 今回の行: 口座が決まっていればそれを、未定ならファイル単位を組の単位にする
    const items = list.map((r) => ({
      date: r.txn.date, amount: r.txn.amount,
      group: r.cls.action === "account" && r.cls.target ? `acct:${r.cls.target}` : `file:${r.fileIdx}`,
      own: r.cls.action === "account" && !isExistingTxn(r.txn) && matchesOwnName(r.txn.desc, own),
    }));
    // 過去の記録(自分名義で収支に載っているもの)も候補に加える
    const past = (existing || [])
      .map((e) => ({ e, k: parseTxnKey(e.src) }))
      .filter((x) => x.k && x.e.cat === "account" && x.e.item !== INTERNAL_TRANSFER_ITEM && matchesOwnName(x.k.desc, own))
      .map((x) => ({ entry: x.e, id: x.e.id, date: x.k.date, amount: x.e.amount, group: `acct:${x.e.account || ""}`, own: true }));
    const partner = pairOwnTransfers([...items, ...past.map(({ date, amount, group, own }) => ({ date, amount, group, own }))]);
    const pairedRows = {};      // 行番号 -> 相手の説明
    const removeIds = [];       // 振替と分かった過去の記録を口座振替へ置き換えるため削除する
    const replacementEntries = [];
    for (let i = 0; i < list.length; i++) {
      const j = partner[i];
      if (j < 0) continue;
      if (j < list.length) pairedRows[i] = list[j].cls?.target || `別の口座`;
      else {
        const p = past[j - list.length];
        pairedRows[i] = `${p.group.slice(5)}（取込済み）`;
        removeIds.push(p.id);
        replacementEntries.push({ ...p.entry, item: INTERNAL_TRANSFER_ITEM });
      }
    }
    const lonely = list.reduce((a, r, i) => a + (items[i].own && pairedRows[i] == null ? 1 : 0), 0);
    return { pairedRows, removeIds, replacementEntries, lonely, ownFlags: items.map((x) => x.own) };
  }, [rows, existing, isExistingTxn, config.ownTransferKeywords]);
  // そのカード・その月度に請求が入力済みなら、取り込まず照合だけする(二重計上を防ぐ)
  const cardAlready = React.useCallback((name, date) =>
    (name ? cardMonthTotal(existing || [], name, cycleYm(date, config.cycleCutoffDay)) : 0),
    [existing, config.cycleCutoffDay]);

  // その月度に給与が入力済みかどうか。入力済みなら取り込まず、金額の照合だけ行う。
  const salaryEntered = React.useCallback((date) => {
    const t = cycleYm(date, config.cycleCutoffDay);
    return (existing || []).reduce((a, e) => a + (e.ym === t && e.cat === "salary" ? e.amount : 0), 0);
  }, [existing, config.cycleCutoffDay]);
  const entries = (rows || []).map((r, i) => (
    (r.cls.action === "salary" && salaryEntered(r.txn.date) !== 0) ||
    (r.cls.action === "card" && cardAlready(r.cls.target, r.txn.date) > 0)
      ? null : txnToEntry(r.txn, pairing.pairedRows[i] != null
    ? { ...r.cls, action: "account", negItem: INTERNAL_TRANSFER_ITEM, posItem: INTERNAL_TRANSFER_ITEM }
    : r.cls, config.cycleCutoffDay)));
  const batchKeys = new Set();
  const dupFlags = entries.map((e, i) => {
    if (!e || !e.src) return false;
    const strong = txnBalanceKey(rows[i].txn);
    const key = strong || e.src;
    const duplicate = isExistingTxn(rows[i].txn) || batchKeys.has(key);
    batchKeys.add(key);
    return duplicate;
  });
  const dupCount = dupFlags.filter(Boolean).length;
  const newEntries = entries.filter((e, i) => e && !dupFlags[i]);
  const includedCount = newEntries.length;
  // CSVの残高列から拾った月末残高も一緒に登録する(残高の手入力が不要になる)。
  // 残高は同じ月・口座で1件だけ持つべきなので、追加ではなく置き換える(App側で差し替え)。
  const openingNumber = openingBalance === "" ? null : Number(openingBalance);
  // 1件ずつではなく総額で照合する(開始残高 + 取引の合計 = 最終残高)。
  // OCRが途中の残高を読み落としても、全体が合っていれば取りこぼしは無い。
  const ocrCheck = React.useMemo(() => (ocrMode && rows && Number.isFinite(openingNumber)
    ? verifyBalanceTotal(rows.map((r) => r.txn), openingNumber) : null), [ocrMode, rows, openingNumber]);
  const ocrVerified = !ocrMode || !!(ocrCheck && ocrCheck.ok);
  const ocrAccount = ocrMode && csvNotes[0] ? csvNotes[0].target : "";
  const ocrBalEntries = [];
  if (ocrMode && ocrVerified && ocrAccount && ocrCheck) {
    // 開始残高は直前月度の終残高として保存。以後は各月度の最後のOCR残高を保存する。
    ocrBalEntries.push({ ym: addMonth(ym, -1), cat: "account", item: "残高", account: ocrAccount, amount: Math.round(openingNumber) });
    const endings = new Map();
    for (const r of (rows || [])) { const t = r.txn; if (Number.isFinite(t.balance)) endings.set(cycleYm(t.date, config.cycleCutoffDay), { date: t.date, balance: t.balance }); }
    for (const [entryYm, v] of endings) ocrBalEntries.push({ ym: entryYm, cat: "account", item: "残高", account: ocrAccount, amount: Math.round(v.balance) });
  }
  const balEntries = [
    ...balances.filter((b) => b.account).map((b) => ({ ym: cycleYm(b.date, config.cycleCutoffDay), cat: "account", item: "残高", account: b.account, amount: Math.round(b.amount) })),
    ...ocrBalEntries,
  ];
  const commit = () => {
    const list = [...newEntries, ...pairing.replacementEntries, ...balEntries];
    // 過去の片側も「口座振替」に置き換え、両口座の移動記録を残したまま収支から外す
    if (list.length || pairing.removeIds.length) onAddEntries(list, pairing.removeIds);
    onClose();
  };

  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>取込</div>
        {!rows && (
          <>
            <button data-testid="csv-upload" style={{ ...styles.saveBtn, marginTop: 0 }} onClick={() => csvRef.current && csvRef.current.click()} disabled={csvBusy}>
              {csvBusy ? "読込中…" : "CSVを選ぶ"}
            </button>
            <input ref={csvRef} type="file" accept=".csv,.txt,text/csv,text/plain" multiple style={{ display: "none" }}
              onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) runCsv(f); e.target.value = ""; }} />
            {csvNotes.length > 0 && (
              <div style={{ margin: "10px 2px 0" }}>
                {csvNotes.map((n, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: n.error ? RED : MUTED, padding: "2px 0" }}>
                    {n.name}：{n.error ? n.error : `${n.count}件${n.target ? ` → ${n.target}` : " / 口座未選択"}${n.balance ? ` / 残高 ${yen(n.balance.amount)}` : ""}`}
                  </div>
                ))}
              </div>
            )}
            <div style={{ height: 12 }} />
            <button data-testid="screenshot-upload" style={styles.backupBtn} onClick={() => fileRef.current && fileRef.current.click()} disabled={ocrBusy}>
              {ocrBusy ? `読込中 ${ocrProgress}` : "スクショ"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) runOcr(f); e.target.value = ""; }} />
            {ocrError && <div style={{ fontSize: 12.5, color: RED, margin: "8px 2px 0" }}>{ocrError}</div>}
            <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
          </>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 12, color: MUTED, margin: "0 2px 12px" }}>{rows.length}件</div>
            {(() => {
              const pairs = Object.keys(pairing.pairedRows).length;
              const lonely = pairing.lonely;
              if (!pairs && !lonely) return null;
              return (
                <>
                  {pairs > 0 && <div style={{ ...styles.flash, background: "var(--group-bg)", color: MUTED }}>振替 {pairs}件</div>}
                  {lonely > 0 && <div style={{ ...styles.flash, background: "var(--expense-soft)", color: RED }}>未照合 {lonely}件</div>}
                </>
              );
            })()}
            {dupCount > 0 && (
              <div style={{ ...styles.flash, background: "var(--group-bg)", color: MUTED }}>
                {dupCount}件は取込済み
              </div>
            )}
            {/* ファイルごとの口座。1ファイル=1口座なので、ここで選べば全行に反映される。 */}
            {csvNotes.filter((n) => !n.error).map((n, i) => (
              <div key={i} style={{ ...styles.detailCard, marginBottom: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, color: MUTED, wordBreak: "break-all", marginBottom: 6 }}>{n.name}（{n.count}件{n.duplicateCount ? `・重複${n.duplicateCount}件除外` : ""}{n.outsideCount ? `・期間外${n.outsideCount}件` : ""}）</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: n.target ? MUTED : RED }}>{n.target ? "口座" : "口座未選択"}</span>
                  <select value={n.target || ""} onChange={(e) => setFileAccount(i, e.target.value)} style={{ ...styles.textInput, width: "auto", margin: 0, padding: "6px 8px", fontSize: 13 }}>
                    <option value="">（未選択）</option>
                    {(config.accounts || []).map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {ocrMode && (
              <div style={{ ...styles.detailCard, marginBottom: 8, padding: "10px 12px" }}>
                <label style={{ ...styles.fieldLabel, marginTop: 0 }}>
                  {openingYm ? `${periodLabel(openingYm, config.cycleCutoffDay)}末の残高` : "開始残高"}
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>（記録があれば自動で入ります）</span>
                </label>
                <input type="number" inputMode="numeric" value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)} style={{ ...styles.textInput, marginBottom: 0 }} />
              </div>
            )}
            {ocrMode && openingBalance === "" && (
              <div style={{ ...styles.flash, background: "var(--group-bg)", color: MUTED }}>開始残高を入れると残高で検算できます（未入力でも追加はできます）</div>
            )}
            {ocrMode && ocrCheck && (
              <div style={{ ...styles.flash, background: ocrVerified ? "var(--group-bg)" : "var(--expense-soft)", color: ocrVerified ? MUTED : RED }}>
                {ocrCheck.ok
                  ? `✓ 残高が合っています（${yen(ocrCheck.opening)} ＋ 取引${yen(ocrCheck.sum)} ＝ ${yen(ocrCheck.closing)}／${ocrCheck.count}件）`
                  : `⚠ 残高が ${yen(Math.abs(ocrCheck.diff))} 合いません（${yen(ocrCheck.opening)} ＋ 取引${yen(ocrCheck.sum)} ＝ ${yen(ocrCheck.opening + ocrCheck.sum)} だが最終残高は ${yen(ocrCheck.closing)}）。読み落としがあるかもしれません。金額を直すか、そのまま追加もできます`}
              </div>
            )}
            {/* 残高での検算。CSVの残高列が「手前の残高＋取引＝その行の残高」で繋がるかを見て、
                読み取り違いや取りこぼしが無いことを取り込む前に確かめられるようにする。 */}
            {/* カードの引き落とし: 入力済みなら取り込まず照合だけ。無ければ請求額として取り込む。 */}
            {(() => {
              const cardRows = (rows || []).filter((r) => r.cls.action === "card" && r.cls.target);
              if (!cardRows.length) return null;
              const seen = new Set();
              return cardRows.map((r, i) => {
                const t = cycleYm(r.txn.date, config.cycleCutoffDay);
                const k = `${r.cls.target}|${t}`;
                if (seen.has(k)) return null;
                seen.add(k);
                const amount = Math.abs(r.txn.amount);
                const already = cardAlready(r.cls.target, r.txn.date);
                const ok = already > 0 && already === amount;
                return (
                  <div key={`cd${i}`} style={{ ...styles.flash, background: already > 0 && !ok ? "var(--expense-soft)" : "var(--group-bg)", color: already > 0 && !ok ? RED : MUTED }}>
                    {already === 0
                      ? `${r.cls.target} ${periodLabel(t, config.cycleCutoffDay)} の引き落とし ${yen(amount)} をカード請求として取り込みます`
                      : ok
                        ? `✓ ${r.cls.target} ${periodLabel(t, config.cycleCutoffDay)} の引き落とし ${yen(amount)} は入力済みと一致（取り込みません）`
                        : `⚠ ${r.cls.target} ${periodLabel(t, config.cycleCutoffDay)}：入力済み ${yen(already)} と引き落とし ${yen(amount)} が ${yen(Math.abs(already - amount))} 違います（入力済みを優先）`}
                  </div>
                );
              });
            })()}
            {/* 給与: 手入力を続ける方針なので取り込まず、入力済みとの照合だけ行う */}
            {(() => {
              const paid = (rows || []).filter((r) => /給与|賞与/.test(r.txn.desc) && r.txn.amount > 0);
              if (!paid.length) return null;
              return paid.map((r, i) => {
                const t = cycleYm(r.txn.date, config.cycleCutoffDay);
                const entered = (existing || []).reduce((a, e) => a + (e.ym === t && e.cat === "salary" ? e.amount : 0), 0);
                const ok = entered > 0 && Math.abs(entered - r.txn.amount) < 1;
                return (
                  <div key={`s${i}`} style={{ ...styles.flash, background: ok || !entered ? "var(--group-bg)" : "var(--expense-soft)", color: ok || !entered ? MUTED : RED }}>
                    {entered === 0
                      ? `${periodLabel(t, config.cycleCutoffDay)} の給与 ${yen(r.txn.amount)} を手取りとして取り込みます（額面・控除はあとで給与フォームから入れられます）`
                      : ok
                        ? `✓ ${periodLabel(t, config.cycleCutoffDay)} の給与 ${yen(r.txn.amount)} は入力済みの手取りと一致（取り込みません）`
                        : `⚠ ${periodLabel(t, config.cycleCutoffDay)} の給与：入金 ${yen(r.txn.amount)} と入力済みの手取り ${yen(entered)} が ${yen(Math.abs(entered - r.txn.amount))} 違います（入力済みを優先して取り込みません）`}
                  </div>
                );
              });
            })()}
            {(() => {
              // 月をまたぐ取込でも、各取引が日付からどの月度へ入るかを見せる
              const by = {};
              for (const r of (rows || [])) { const k = cycleYm(r.txn.date, config.cycleCutoffDay); by[k] = (by[k] || 0) + 1; }
              const ks = Object.keys(by).sort();
              if (ks.length < 2) return null;
              return (
                <div style={{ ...styles.flash, background: "var(--group-bg)", color: MUTED }}>
                  月をまたいでいます：{ks.map((k) => `${periodLabel(k, config.cycleCutoffDay)} ${by[k]}件`).join(" / ")}（日付でそれぞれの月度へ振り分けます）
                </div>
              );
            })()}
            {csvNotes.filter((n) => n.check).map((n, i) => (
              <div key={i} style={{ ...styles.flash, background: n.check.mismatched ? "var(--expense-soft)" : "var(--group-bg)", color: n.check.mismatched ? RED : MUTED }}>
                {n.check.mismatched === 0
                  ? `✓ 検算 ${n.check.checked}件${n.balance ? ` / ${yen(n.balance.amount)}` : ""}`
                  : `⚠ 不一致 ${n.check.mismatched}件${n.check.firstMismatch ? ` / ${n.check.firstMismatch.date} ${yen(n.check.firstMismatch.expected)} → ${yen(n.check.firstMismatch.actual)}` : ""}`}
              </div>
            ))}
            {balEntries.length > 0 && (
              <div style={{ ...styles.detailCard, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, padding: "8px 2px 4px" }}>残高</div>
                {balEntries.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 2px" }}>
                    <span style={{ color: MUTED }}>{b.account}</span><span>{yen(b.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {rows.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 10 }}>0件</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r, i) => {
                const entry = entries[i];
                const isDup = dupFlags[i];
                const needsTarget = r.cls.action !== "skip" && !r.cls.target;
                return (
                  <div key={i} style={{ ...styles.detailCard, opacity: entry && !isDup ? 1 : 0.55 }}>
                    {isDup && <div style={{ fontSize: 11, color: MUTED, padding: "6px 2px 0" }}>取込済み（重複のため登録しません）</div>}
                    {pairing.pairedRows[i] != null && (
                      <div style={{ fontSize: 11, color: ACCENT, padding: "6px 2px 0" }}>
                        振替（{pairing.pairedRows[i]}）
                      </div>
                    )}
                    {pairing.ownFlags[i] && pairing.pairedRows[i] == null && (
                      <div style={{ fontSize: 11, color: RED, padding: "6px 2px 0" }}>
                        未照合
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 2px", gap: 8 }}>
                      <span style={{ fontSize: 12.5, color: MUTED, flexShrink: 0 }}>
                        {r.txn.date}
                        <span style={{ fontSize: 10.5, marginLeft: 6, opacity: 0.8 }}>{periodLabel(cycleYm(r.txn.date, config.cycleCutoffDay), config.cycleCutoffDay)}</span>
                      </span>
                      <input type="number" inputMode="numeric" value={r.txn.amount}
                        onChange={(e) => setRow(i, { txn: { ...r.txn, amount: e.target.value === "" ? 0 : Number(e.target.value) } })}
                        style={{ ...styles.textInput, width: 120, textAlign: "right", padding: "5px 8px", fontSize: 14.5, fontWeight: 600, color: r.txn.amount < 0 ? RED : GREEN }} />
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 8, wordBreak: "break-all" }}>{r.txn.desc || "(摘要なし)"}</div>
                    <div style={styles.optionRow}>
                      {[["skip", "取り込まない"], ["card", "カード"], ["account", "口座"], ["salary", "給与"]].map(([v, l]) => (
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
              {includedCount}件を追加{balEntries.length > 0 ? `＋残高${balEntries.length}件` : ""}
            </button>
            <button style={styles.cancelBtn} onClick={() => { setRows(null); setOcrMode(false); setOpeningBalance(""); }}>やり直す</button>
            <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
          </>
        )}
      </div>
    </div>
  );
}
