
export const yen = (n) => (n < 0 ? "-" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");

export const num = (n) => (n == null ? "" : Math.round(n).toLocaleString("ja-JP"));

export const ymLabel = (ym) => { const [y, m] = ym.split("-"); return `${y}年${parseInt(m, 10)}月`; };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const addMonth = (ym, d) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };


// 旧バージョン(kindベース)のデータを新形式(catベース)に変換して救済する
export function migrateEntry(e) {
  if (!e || typeof e !== "object") return null;
  const id = e.id || uid();
  // すでに新形式でも、臨時収入が給与系に紛れていたら口座の受取へ移す
  if (e.cat) {
    if (e.cat === "salary" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "受取", account: e.account || "", amount: Math.abs(e.amount) };
    return { ...e, id };
  }
  // 旧形式: kind = income/deduction/expense/card/transfer/balance
  const k = e.kind;
  if (k === "income" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "受取", account: e.account || "", amount: Math.abs(e.amount) };
  if (k === "salary" || k === "income") return { id, ym: e.ym, cat: "salary", item: e.item || "給与", account: "", amount: e.amount };
  if (k === "deduction") return { id, ym: e.ym, cat: "salary", item: "控除", account: "", amount: -Math.abs(e.amount) };
  if (k === "card") return { id, ym: e.ym, cat: "card", item: e.item, account: "", amount: Math.abs(e.amount) };
  if (k === "balance") return { id, ym: e.ym, cat: "account", item: "残高", account: e.account || "", amount: e.amount };
  if (k === "expense") return { id, ym: e.ym, cat: "account", item: "引出", account: e.account || "", amount: -Math.abs(e.amount) };
  if (k === "transfer") return { id, ym: e.ym, cat: "account", item: e.amount >= 0 ? "受取" : "引出", account: e.account || "", amount: e.amount };
  // 判別不能なものは無視(壊れたデータで落ちないように)
  return null;
}


export const DEFAULT_CONFIG = { accounts: ["ゆうちょ", "住信SBI", "JRE BANK"], salaryItems: ["給与", "手当", "賞与", "控除"] };


// 口座記録の種類。role: bal=残高記録 / in=収入に算入 / out=支出に算入 / transfer=符号そのまま収支に算入
export const ACCOUNT_TYPES = [
  { id: "残高", role: "bal", hint: "口座の残高を記録します" },
  { id: "預入", role: "in", hint: "口座への預け入れ。収入に入ります" },
  { id: "引出", role: "out", hint: "口座からの引き出し。支出に入ります" },
  { id: "受取", role: "in", hint: "送金などの受け取り。収入に入ります" },
  { id: "送金", role: "out", hint: "他所への送金。支出に入ります" },
  { id: "投資振替", role: "transfer", hint: "投資/ハイブリッド口座への振替。入れた分は支出、戻した分は収入" },
];

export const acctRole = (item) => (ACCOUNT_TYPES.find((t) => t.id === item)?.role) || (item === "入金" || item === "現金預入" || item === "送金受取" ? "in" : item === "出金" || item === "現金引出" ? "out" : item === "残高" ? "bal" : "out");


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
  { ym: "2026-04", cat: "account", item: "残高", account: "住信SBI", amount: 47495 },
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
  { ym: "2026-05", cat: "account", item: "受取", account: "ゆうちょ", amount: 52563 },
  { ym: "2026-05", cat: "account", item: "引出", account: "ゆうちょ", amount: -6165 },
  { ym: "2026-05", cat: "account", item: "残高", account: "住信SBI", amount: 5296 },
  { ym: "2026-05", cat: "account", item: "受取", account: "住信SBI", amount: 63172 },
  { ym: "2026-05", cat: "account", item: "残高", account: "JRE BANK", amount: 20399 },
  { ym: "2026-05", cat: "account", item: "受取", account: "JRE BANK", amount: 19760 },
  { ym: "2026-06", cat: "salary", item: "給与", account: "", amount: 286720 },
  { ym: "2026-06", cat: "salary", item: "手当", account: "", amount: 4136 },
  { ym: "2026-06", cat: "salary", item: "賞与", account: "", amount: 134073 },
  { ym: "2026-06", cat: "salary", item: "控除", account: "", amount: -50034 },
  { ym: "2026-06", cat: "card", item: "SMCC Gold", account: "", amount: 97508 },
  { ym: "2026-06", cat: "card", item: "smcc", account: "", amount: 294 },
  { ym: "2026-06", cat: "card", item: "EPOS", account: "", amount: 15322 },
  { ym: "2026-06", cat: "card", item: "PayPay", account: "", amount: 5314 },
  { ym: "2026-06", cat: "account", item: "残高", account: "ゆうちょ", amount: 155596 },
  { ym: "2026-06", cat: "account", item: "残高", account: "住信SBI", amount: 5660 },
  { ym: "2026-06", cat: "account", item: "引出", account: "住信SBI", amount: -25000 },
  { ym: "2026-06", cat: "account", item: "投資振替", account: "住信SBI", amount: -94000 },
  { ym: "2026-06", cat: "account", item: "残高", account: "JRE BANK", amount: 20399 },
];


export const SEED_DEBT = {
  "SMCC Gold": { "2026-06": 55140, "2026-07": 54804, "2026-08": 47975, "2026-09": 44041, "2026-10": 37845, "2026-11": 34866, "2026-12": 34480 },
  "smcc": { "2026-06": 294, "2026-07": 294, "2026-08": 294 },
  "JAL navi": { "2026-06": 37284, "2026-07": 37284, "2026-08": 4740 },
  "VIEW": { "2026-06": 37100 },
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
  const flowTypes = ["預入", "受取", "引出", "送金", "投資振替"];
  accounts.forEach((a) => flowTypes.forEach((t) => push("account", t, a)));
  accounts.forEach((a) => push("account", "残高", a));
  // 実データを流し込む(器に無い項目=旧データも動的に追加)
  for (const e of monthEntries) push(e.cat, e.item, e.cat === "account" ? e.account : "", e);
  const totalOf = (key) => byKey[key].entries.reduce((a, e) => a + e.amount, 0);
  const get = (cat, item, account) => byKey[cat + "|" + item + "|" + (account || "")] || { entries: [], cat, item, account: account || "" };
  return { byKey, totalOf, get, accounts, flowTypes };
}
