
export const yen = (n) => (n < 0 ? "-" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");

export const num = (n) => (n == null ? "" : Math.round(n).toLocaleString("ja-JP"));

export const ymLabel = (ym) => { const [y, m] = ym.split("-"); return `${y}年${parseInt(m, 10)}月`; };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const addMonth = (ym, d) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };


// 旧バージョン(kindベース)のデータを新形式(catベース)に変換して救済する
export function migrateEntry(e) {
  if (!e || typeof e !== "object") return null;
  const id = e.id || uid();
  // すでに新形式でも、臨時収入が給与系に紛れていたら口座の入金へ移す。
  // 旧称「受取」は「入金」に統一する。
  if (e.cat) {
    if (e.cat === "salary" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "入金", account: e.account || "", amount: Math.abs(e.amount) };
    if (e.cat === "account" && e.item === "受取") return { ...e, id, item: "入金" };
    return { ...e, id };
  }
  // 旧形式: kind = income/deduction/expense/card/transfer/balance
  const k = e.kind;
  if (k === "income" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "入金", account: e.account || "", amount: Math.abs(e.amount) };
  if (k === "salary" || k === "income") return { id, ym: e.ym, cat: "salary", item: e.item || "給与", account: "", amount: e.amount };
  if (k === "deduction") return { id, ym: e.ym, cat: "salary", item: "控除", account: "", amount: -Math.abs(e.amount) };
  if (k === "card") return { id, ym: e.ym, cat: "card", item: e.item, account: "", amount: Math.abs(e.amount) };
  if (k === "balance") return { id, ym: e.ym, cat: "account", item: "残高", account: e.account || "", amount: e.amount };
  if (k === "expense") return { id, ym: e.ym, cat: "account", item: "引出", account: e.account || "", amount: -Math.abs(e.amount) };
  if (k === "transfer") return { id, ym: e.ym, cat: "account", item: e.amount >= 0 ? "入金" : "引出", account: e.account || "", amount: e.amount };
  // 判別不能なものは無視(壊れたデータで落ちないように)
  return null;
}


// 入出金・振替の種類(残高を除く)。口座ごとに表示する種類を絞り込める。
export const ALL_FLOW_TYPES = ["預入", "入金", "引出", "送金", "投資振替"];

export const DEFAULT_CONFIG = {
  accounts: ["ゆうちょ", "NEOBANK", "JRE BANK"],
  salaryItems: ["給与", "手当", "賞与", "控除"],
  // 口座ごとに表示する入出金・振替の種類(未指定の口座は全種類を表示)
  accountFlows: {
    "ゆうちょ": ["預入", "入金", "引出", "送金"],   // 投資振替は使わない
    "JRE BANK": ["入金", "送金", "投資振替"],        // 預入・引出は使わない
  },
};

// その口座で表示する入出金・振替の種類を返す(未設定なら全種類)
export const flowTypesFor = (account, config) => (config && config.accountFlows && config.accountFlows[account]) || ALL_FLOW_TYPES;


// 口座記録の種類。role: bal=残高記録 / in=収入に算入 / out=支出に算入 / transfer=符号そのまま収支に算入
export const ACCOUNT_TYPES = [
  { id: "残高", role: "bal", hint: "口座の残高を記録します" },
  { id: "預入", role: "in", hint: "口座への預け入れ。収入に入ります" },
  { id: "引出", role: "out", hint: "口座からの引き出し。支出に入ります" },
  { id: "入金", role: "in", hint: "送金などの受け取り。収入に入ります" },
  { id: "送金", role: "out", hint: "他所への送金。支出に入ります" },
  { id: "投資振替", role: "transfer", hint: "投資/ハイブリッド口座への振替。入れた分は支出、戻した分は収入" },
];

export const acctRole = (item) => (ACCOUNT_TYPES.find((t) => t.id === item)?.role) || (item === "入金" || item === "受取" || item === "現金預入" || item === "送金受取" ? "in" : item === "出金" || item === "現金引出" ? "out" : item === "残高" ? "bal" : "out");

// 設定(config)内の口座フロー種別の旧称「受取」を「入金」に移行する
export function migrateConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const af = cfg.accountFlows;
  if (af && typeof af === "object") {
    const naf = {};
    for (const [k, arr] of Object.entries(af)) naf[k] = (Array.isArray(arr) ? arr : []).map((t) => (t === "受取" ? "入金" : t));
    return { ...cfg, accountFlows: naf };
  }
  return cfg;
}


// 1ヶ月分の記録から収支サマリを計算する(サマリ画面・年間の貯蓄率グラフで共用)
export function computeSummary(monthEntries) {
  let gross = 0, deduction = 0, cardTotal = 0, cashIn = 0, cashOut = 0, invest = 0; const balances = {};
  for (const e of monthEntries) {
    if (e.cat === "salary") { if (e.item === "控除") deduction += e.amount; else gross += e.amount; }
    else if (e.cat === "card") cardTotal += Math.abs(e.amount);
    else if (e.cat === "account") {
      const role = acctRole(e.item);
      if (role === "bal") balances[e.account] = e.amount;
      else if (role === "transfer") invest += e.amount;        // 符号そのまま(入=−, 戻し=＋ を利用者が符号で表現)
      else if (role === "in") cashIn += Math.abs(e.amount);
      else if (role === "out") cashOut += Math.abs(e.amount);
    }
  }
  const income = gross + deduction + cashIn, expense = cardTotal + cashOut;
  const net = income - expense + invest;   // 投資振替は符号のまま加算(−なら支出方向、＋なら収入方向)
  const balTotal = Object.values(balances).reduce((a, b) => a + b, 0);
  return { gross, deduction, cardTotal, cashIn, cashOut, invest, income, expense, net, balances, balTotal };
}


export const DEFAULT_CARDS = [
  { id: uid(), name: "SMCC Gold", brand: "VISA", note: "三井住友ゴールドNL" },
  { id: uid(), name: "smcc", brand: "VISA", note: "三井住友NL" },
  { id: uid(), name: "JAL navi", brand: "JCB", note: "JALカードNavi" },
  { id: uid(), name: "VIEW", brand: "VISA", note: "ビューゴールド" },
  { id: uid(), name: "JCB Gold", brand: "JCB", note: "" },
  { id: uid(), name: "SAISON", brand: "AMEX", note: "セゾン" },
  { id: uid(), name: "EPOS", brand: "VISA", note: "エポス" },
  { id: uid(), name: "TOBU", brand: "VISA", note: "東武" },
  { id: uid(), name: "PayPay", brand: "JCB", note: "PayPayカード" },
  { id: uid(), name: "MDC", brand: "VISA", note: "大丸松坂屋" },
];


export const SEED_ENTRIES = [
  { ym: "2026-04", cat: "account", item: "残高", account: "ゆうちょ", amount: 48924 },
  { ym: "2026-04", cat: "account", item: "残高", account: "NEOBANK", amount: 47495 },
  { ym: "2026-04", cat: "account", item: "残高", account: "JRE BANK", amount: 1199 },
  { ym: "2026-05", cat: "salary", item: "給与", account: "", amount: 286720 },
  { ym: "2026-05", cat: "salary", item: "手当", account: "", amount: 2068 },
  { ym: "2026-05", cat: "salary", item: "控除", account: "", amount: -49953 },
  { ym: "2026-05", cat: "card", item: "SMCC Gold", account: "", amount: 66065 },
  { ym: "2026-05", cat: "card", item: "smcc", account: "", amount: 294 },
  { ym: "2026-05", cat: "card", item: "JAL navi", account: "", amount: 51943 },
  { ym: "2026-05", cat: "card", item: "VIEW", account: "", amount: 143560 },
  { ym: "2026-05", cat: "card", item: "SAISON", account: "", amount: 135270 },
  { ym: "2026-05", cat: "card", item: "PayPay", account: "", amount: 19550 },
  { ym: "2026-05", cat: "card", item: "MDC", account: "", amount: 2025 },
  { ym: "2026-05", cat: "account", item: "残高", account: "ゆうちょ", amount: 18503 },
  { ym: "2026-05", cat: "account", item: "入金", account: "ゆうちょ", amount: 52563 },
  { ym: "2026-05", cat: "account", item: "引出", account: "ゆうちょ", amount: -6165 },
  { ym: "2026-05", cat: "account", item: "残高", account: "NEOBANK", amount: 5296 },
  { ym: "2026-05", cat: "account", item: "入金", account: "NEOBANK", amount: 63172 },
  { ym: "2026-05", cat: "account", item: "残高", account: "JRE BANK", amount: 20399 },
  { ym: "2026-05", cat: "account", item: "入金", account: "JRE BANK", amount: 19760 },
  { ym: "2026-06", cat: "salary", item: "給与", account: "", amount: 286720 },
  { ym: "2026-06", cat: "salary", item: "手当", account: "", amount: 4136 },
  { ym: "2026-06", cat: "salary", item: "賞与", account: "", amount: 134073 },
  { ym: "2026-06", cat: "salary", item: "控除", account: "", amount: -50034 },
  { ym: "2026-06", cat: "card", item: "SMCC Gold", account: "", amount: 97508 },
  { ym: "2026-06", cat: "card", item: "smcc", account: "", amount: 294 },
  { ym: "2026-06", cat: "card", item: "EPOS", account: "", amount: 15322 },
  { ym: "2026-06", cat: "card", item: "PayPay", account: "", amount: 5314 },
  { ym: "2026-06", cat: "account", item: "残高", account: "ゆうちょ", amount: 155596 },
  { ym: "2026-06", cat: "account", item: "残高", account: "NEOBANK", amount: 5660 },
  { ym: "2026-06", cat: "account", item: "引出", account: "NEOBANK", amount: -25000 },
  { ym: "2026-06", cat: "account", item: "投資振替", account: "NEOBANK", amount: -94000 },
  { ym: "2026-06", cat: "account", item: "残高", account: "JRE BANK", amount: 20399 },
];


export const SEED_DEBT = {
  "SMCC Gold": { "2026-06": 55140, "2026-07": 54804, "2026-08": 47975, "2026-09": 44041, "2026-10": 37845, "2026-11": 34866, "2026-12": 34480 },
  "smcc": { "2026-06": 294, "2026-07": 294, "2026-08": 294 },
  "JAL navi": { "2026-06": 37284, "2026-07": 37284, "2026-08": 4740 },
  "VIEW": { "2026-06": 37100 },
};


// 収支計算とは無関係の自由メモ(交際費などの覚え書き)の初期データ。カテゴリで小計をまとめる。
export const SEED_MEMOS = [
  { id: uid(), title: "6月 飲み会", amount: 5000, body: "同期と", category: "交際費", ym: "2026-06" },
  { id: uid(), title: "誕生日プレゼント", amount: 7000, body: "", category: "交際費", ym: "2026-06" },
];

// サブスク管理の初期データ。cycle は "monthly"(月額) / "yearly"(年払い)。
// card は所有カード名、renewal は次回更新日(YYYY-MM-DD)。収支には計上しない。
export const SEED_SUBS = [
  { id: uid(), name: "Netflix", amount: 1490, cycle: "monthly", card: "SMCC Gold", renewal: "", plan: "スタンダード", note: "" },
  { id: uid(), name: "Spotify", amount: 980, cycle: "monthly", card: "", renewal: "", plan: "", note: "" },
  { id: uid(), name: "Amazon Prime", amount: 5900, cycle: "yearly", card: "JCB Gold", renewal: "2026-11-01", plan: "年間プラン", note: "" },
];


// ===== 計画(plan) =====
// 年度(4月開始)の12か月の ym を返す
export const planMonths = (fyStart) => Array.from({ length: 12 }, (_, i) => { const d = new Date(fyStart, 3 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });

// ym から年度開始年(4月)を求める
export const fyStartOf = (ym) => { const [y, m] = ym.split("-").map(Number); return m >= 4 ? y : y - 1; };

// 計画の行を設定・カードから生成。group=income/expense、sub=小見出し、
// key は実績とマッピングするための識別子("salary|給与" / "card|SMCC Gold" / "flow|投資" / "memo|交際費")
export function planLines(config, cards) {
  const lines = [];
  (config.salaryItems || []).forEach((it) => lines.push({ key: "salary|" + it, group: "income", sub: "給与系", label: it }));
  lines.push({ key: "flow|入金", group: "income", sub: "その他収入", label: "臨時収入・入金" });
  (cards || []).forEach((c) => lines.push({ key: "card|" + c.name, group: "expense", sub: "カード", label: c.name }));
  lines.push({ key: "flow|投資", group: "expense", sub: "その他支出", label: "投資" });
  lines.push({ key: "memo|交際費", group: "expense", sub: "その他支出", label: "交際費" });
  lines.push({ key: "flow|出金", group: "expense", sub: "その他支出", label: "現金出金" });
  return lines;
}

// 計画額(標準月 std ＋ 例外月 over の上書き)
export const planValue = (plan, key, ym) => {
  const l = plan && plan.lines && plan.lines[key];
  if (!l) return 0;
  const v = l.over && l.over[ym] != null ? l.over[ym] : l.std;
  return Number(v) || 0;
};

// 実績額(計画と同じ符号規約で1行・1か月ぶん)。monthEntries はその月の記録。
export function actualForLine(key, monthEntries, memos, ym) {
  const [type, name] = key.split("|");
  if (type === "salary") return monthEntries.reduce((a, e) => a + (e.cat === "salary" && e.item === name ? e.amount : 0), 0);
  if (type === "card") return monthEntries.reduce((a, e) => a + (e.cat === "card" && e.item === name ? Math.abs(e.amount) : 0), 0);
  if (type === "memo") return (memos || []).reduce((a, m) => a + ((m.category || "") === name && m.ym === ym ? (Number(m.amount) || 0) : 0), 0);
  if (type === "flow") {
    if (name === "投資") return -monthEntries.reduce((a, e) => a + (e.cat === "account" && acctRole(e.item) === "transfer" ? e.amount : 0), 0);
    const role = name === "入金" ? "in" : "out";
    return monthEntries.reduce((a, e) => a + (e.cat === "account" && acctRole(e.item) === role ? Math.abs(e.amount) : 0), 0);
  }
  return 0;
}

// 初期計画(スプレッドシートを参考にした標準月＋一部上書き)。年度は当該データに合わせ2026。
export const SEED_PLAN = {
  fyStart: 2026,
  lines: {
    "salary|給与": { std: 310000, over: { "2026-06": 286000 } },
    "salary|手当": { std: 0, over: { "2026-06": 160000, "2026-07": 72000, "2026-10": 90000, "2027-01": 620000 } },
    "salary|賞与": { std: 0, over: {} },
    "salary|控除": { std: -62000, over: { "2026-06": -89000, "2026-07": -76000 } },
    "flow|入金": { std: 0, over: { "2026-11": 1100000 } },
    "card|SMCC Gold": { std: 40000, over: {} },
    "card|smcc": { std: 300, over: {} },
    "card|JAL navi": { std: 20000, over: {} },
    "card|VIEW": { std: 60000, over: { "2026-06": 50000 } },
    "card|JCB Gold": { std: 10000, over: {} },
    "card|SAISON": { std: 15000, over: {} },
    "card|EPOS": { std: 1000, over: {} },
    "card|TOBU": { std: 1000, over: {} },
    "card|PayPay": { std: 4000, over: {} },
    "card|MDC": { std: 1000, over: {} },
    "flow|投資": { std: 46000, over: {} },
    "memo|交際費": { std: 25000, over: {} },
    "flow|出金": { std: 0, over: {} },
  },
};


// 月データを、元incomeと同じ並びの「項目リスト」に整える(0円項目も含む)
export function buildStructure(monthEntries, config, cards) {
  const byKey = {}; // key -> {item, account, cat, entries[]}
  const push = (cat, item, account, e) => {
    const key = cat + "|" + item + "|" + (account || "");
    if (!byKey[key]) byKey[key] = { cat, item, account: account || "", entries: [] };
    if (e) byKey[key].entries.push(e);
  };
  // 先に器を用意(0円でも表示するため)
  (config.salaryItems || []).forEach((it) => push("salary", it, ""));
  (cards || []).forEach((c) => push("card", c.name, ""));
  const accounts = config.accounts || [];
  const flowsFor = (a) => flowTypesFor(a, config);
  accounts.forEach((a) => flowsFor(a).forEach((t) => push("account", t, a)));
  accounts.forEach((a) => push("account", "残高", a));
  // 実データを流し込む(器に無い項目=旧データも動的に追加)
  for (const e of monthEntries) push(e.cat, e.item, e.cat === "account" ? e.account : "", e);
  const totalOf = (key) => byKey[key].entries.reduce((a, e) => a + e.amount, 0);
  const get = (cat, item, account) => byKey[cat + "|" + item + "|" + (account || "")] || { entries: [], cat, item, account: account || "" };
  return { byKey, totalOf, get, accounts, flowsFor, flowTypes: ALL_FLOW_TYPES };
}
