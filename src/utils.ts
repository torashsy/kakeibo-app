// ===== データモデル =====
export type Cat = "salary" | "card" | "account";

export interface Entry {
  id?: string;
  ym: string;          // "YYYY-MM"
  cat: Cat;
  item: string;
  account?: string;
  amount: number;
  src?: string;        // 取込元の指紋(日付|金額|摘要)。同じ明細を二重に取り込まないための目印
}

export interface Config {
  accounts: string[];
  salaryItems: string[];
  accountFlows?: Record<string, string[]>;
  memoCategories?: string[]; // メモのカテゴリのうち、計画タブで目安/実績を追跡するもの
  importRules?: ImportRule[]; // スクショ取込で摘要から自動振り分けするルール(先勝ち)
  cycleCutoffDay?: number;    // 家計の月の締め日。0/未設定は暦通り。10なら「10日締め」=11日〜翌月10日を1周期(土日祝は翌営業日)
  ownTransferKeywords?: string[]; // 自分名義の口座間送金とみなす摘要のキーワード(例: 自分の氏名)。該当は収支に計上しない
  csvAccountMap?: Record<string, string>; // CSVの目印→口座。一度選べば次回から自動で振り分ける
  importLinks?: { id: string; name: string; url: string }[]; // 明細CSVを落とす画面へのリンク。取込画面から開く
  importRulesSeeded?: number;     // 既定ルールを追加した版。増やすと一度だけ追加が走る(利用者が消したルールは復活しない)
  ownTransferKeywordsSeeded?: number; // 自分名義キーワードを追加した版
}

// スクショ取込(OCR)の振り分けルール。matchは摘要に含まれるキーワード(部分一致)。
// action="card"はtargetをカード名としてカード請求に、"account"はtargetを口座名として口座記録に、
// "skip"は記録しない(例: 自分名義の口座間送金)。account用のnegItem/posItemを省略すると出金/入金になる
// (ATMの引出/預入、投資振替のように項目名を変えたい場合に指定する。投資振替は符号のまま反映するので両方同じ値でよい)。
export interface ImportRule { id: string; match: string; action: "card" | "account" | "skip"; target?: string; negItem?: string; posItem?: string; }

export interface Card {
  id: string;
  name: string;
  brand?: string;
  note?: string;
  annualFee?: number;
}

export interface Memo {
  id: string;
  title: string;
  amount?: number | string;
  body?: string;
  category?: string;
  ym?: string;          // "YYYY-MM"。任意(計画との月別比較に使用)
  linkedCard?: string;  // 紐づくカード名(任意)。収支には影響せず、そのカードの内訳表示にのみ使う
}

export interface Sub {
  id: string;
  name: string;
  amount: number | string;
  cycle: "monthly" | "yearly";
  category?: string;    // サブスク/通信/光熱/保険など。定期費の分類・小計・解約検討に使う
  card?: string;
  renewal?: string;     // "YYYY-MM-DD"
  plan?: string;
  note?: string;
}

export interface PlanLineData { std: number; over: Record<string, number>; }
export interface Plan { fyStart?: number; lines: Record<string, PlanLineData>; }

export interface Summary {
  gross: number; deduction: number; cardTotal: number; cashIn: number; cashOut: number; invest: number;
  income: number; expense: number; net: number; balances: Record<string, number>; balTotal: number;
}

export interface PlanVsActual {
  planIncome: number; actualIncome: number;
  planSpending: number; actualSpending: number;   // 支出は正の額(カード請求＋現金出金)
  planNet: number; actualNet: number;
  diff: number;   // 収支の差(実績−計画)
}

export const yen = (n: number) => (n < 0 ? "-" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");

export const num = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("ja-JP"));

// 金額欄の四則演算パーサ。"1000+2000"、"50,000-3,000*2"、"(1+2)*3" 等を評価して数値を返す。
// ¥・カンマ・空白・全角演算子(＋−×÷)を吸収する。評価できなければ null。eval は使わず自前の再帰下降で安全に計算。
export function evalAmount(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input).trim();
  if (s === "") return null;
  s = s.replace(/[×✕Xx＊]/g, "*").replace(/[÷]/g, "/").replace(/＋/g, "+").replace(/[－−ー]/g, "-").replace(/[¥￥,\s]/g, "");
  if (!/^[-+*/().0-9]+$/.test(s)) return null;
  let i = 0;
  const parseExpr = (): number => {
    let v = parseTerm();
    while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const r = parseTerm(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (s[i] === "*" || s[i] === "/") { const op = s[i++]; const r = parseFactor(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const parseFactor = (): number => {
    if (s[i] === "+") { i++; return parseFactor(); }
    if (s[i] === "-") { i++; return -parseFactor(); }
    if (s[i] === "(") { i++; const v = parseExpr(); if (s[i] !== ")") throw new Error("paren"); i++; return v; }
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (i === start) throw new Error("num");
    const n = parseFloat(s.slice(start, i));
    if (!Number.isFinite(n)) throw new Error("nan");
    return n;
  };
  try {
    const v = parseExpr();
    if (i !== s.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

export const ymLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${y}年${parseInt(m, 10)}月`; };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const addMonth = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };

// ===== 日本の銀行営業日(祝日判定) =====
// 祝日は計算で求める(春分/秋分の近似式は1980-2099で有効)。振替休日も反映。
// 銀行休業日 = 土日 + 祝日 + 年末年始(12/31・1/2・1/3)。引き落とし日がこれらなら翌営業日へ送られる。
const _holidayCache: Record<number, Set<string>> = {};
function jpHolidaySet(year: number): Set<string> {
  if (_holidayCache[year]) return _holidayCache[year];
  const md = (m: number, d: number) => `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const nthMonday = (m: number, n: number) => { const first = new Date(year, m - 1, 1).getDay(); const firstMon = 1 + ((8 - first) % 7); return firstMon + (n - 1) * 7; };
  const shunbun = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const shubun = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const base: [number, number][] = [
    [1, 1], [2, 11], [2, 23], [4, 29], [5, 3], [5, 4], [5, 5], [8, 11], [11, 3], [11, 23],
    [1, nthMonday(1, 2)], [7, nthMonday(7, 3)], [9, nthMonday(9, 3)], [10, nthMonday(10, 2)],
    [3, shunbun], [9, shubun],
  ];
  const set = new Set(base.map(([m, d]) => md(m, d)));
  // 振替休日: 日曜が祝日ならその後の非祝日(通常は翌月曜)を休日にする
  for (const [m, d] of base) {
    if (new Date(year, m - 1, d).getDay() === 0) {
      let nx = new Date(year, m - 1, d + 1);
      while (set.has(md(nx.getMonth() + 1, nx.getDate()))) nx = new Date(nx.getFullYear(), nx.getMonth(), nx.getDate() + 1);
      set.add(md(nx.getMonth() + 1, nx.getDate()));
    }
  }
  _holidayCache[year] = set;
  return set;
}
export function isBankHoliday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || dow === 6) return true;
  const mmdd = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (mmdd === "12-31" || mmdd === "01-02" || mmdd === "01-03") return true;
  return jpHolidaySet(y).has(mmdd);
}
// 締め日(day)を、その月で銀行営業日になるまで後ろへ送った「実際の締め日(日)」を返す
function businessCutoffDay(year: number, month: number, day: number): number {
  let dt = new Date(year, month - 1, day);
  const ds = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  while (isBankHoliday(ds(dt))) dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
  return dt.getMonth() === month - 1 ? dt.getDate() : 99; // 翌月へ跨いだら実質その月は全て前周期
}

// ===== 締め日(サイクル) =====
// 家計の「月」を締め日で区切る。cutoffDay=0(既定は暦通り)。cutoffDay=10なら「10日締め」=
// 11日〜翌月10日 を1周期とし、周期は「開始月」で呼ぶ(例: 6/11〜7/10 = "2026-06" = 6月度)。
// 締め日(引き落とし日)が土日祝なら翌営業日にずれるので、その分も同じ周期に含める。
export const cycleYm = (dateStr: string, cutoffDay: number = 0): string => {
  if (!dateStr) return "";
  const ym = dateStr.slice(0, 7);
  if (!cutoffDay || cutoffDay < 1) return ym;
  const [y, m, d] = dateStr.split("-").map(Number);
  const cutoff = businessCutoffDay(y, m, cutoffDay); // 締め日を営業日で自動調整
  return d > cutoff ? ym : addMonth(ym, -1);
};
// 今日が属する周期の ym
export const currentCycleYm = (cutoffDay: number = 0): string => {
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return cycleYm(ds, cutoffDay);
};
// 周期の表示名。締め日ありなら「2026年6月度」。
export const periodLabel = (ym: string, cutoffDay: number = 0): string => (!cutoffDay || cutoffDay < 1 ? ymLabel(ym) : `${ymLabel(ym)}度`);
// 周期の日付範囲「6/11〜7/10」。締め日が無ければ空。
export const periodRange = (ym: string, cutoffDay: number = 0): string => {
  if (!cutoffDay || cutoffDay < 1) return "";
  const [, m] = ym.split("-").map(Number);
  const end = addMonth(ym, 1);
  const em = Number(end.split("-")[1]);
  return `${m}/${cutoffDay + 1}〜${em}/${cutoffDay}`;
};


// 旧バージョン(kindベース)のデータを新形式(catベース)に変換して救済する
export function migrateEntry(e: any): Entry | null {
  if (!e || typeof e !== "object") return null;
  const id = e.id || uid();
  // すでに新形式でも、臨時収入が給与系に紛れていたら口座の入金へ移す。
  // 旧称「受取」は「入金」に統一する。
  if (e.cat) {
    if (e.cat === "salary" && e.item === "臨時収入") return { id, ym: e.ym, cat: "account", item: "入金", account: e.account || "", amount: Math.abs(e.amount) };
    if (e.cat === "account" && e.item === "受取") return { ...e, id, item: "入金" };
    if (e.cat === "account" && e.item === "送金") return { ...e, id, item: "出金" };
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
export const INTERNAL_TRANSFER_ITEM = "口座振替";
export const ALL_FLOW_TYPES: string[] = ["預入", "入金", "引出", "出金", "投資振替", INTERNAL_TRANSFER_ITEM];

export const DEFAULT_CONFIG: Config = {
  accounts: ["ゆうちょ", "NEOBANK", "JRE BANK"],
  salaryItems: ["給与", "手当", "賞与", "控除"],
  // 口座ごとに表示する入出金・振替の種類(未指定の口座は全種類を表示)
  accountFlows: {
    "ゆうちょ": ["預入", "入金", "引出", "出金"],   // 投資振替は使わない
    "JRE BANK": ["入金", "出金", "投資振替"],        // 預入・引出は使わない
  },
  memoCategories: ["交際費"],
  ownTransferKeywords: ["ハヤシシュンヤ"],
  // スクショ取込の初期ルール例(自払=カード引き落とし、ことら=自分名義の口座間送金なので未計上)
  importRules: [
    // 給与・賞与は給与明細から手入力する(控除などの内訳を残すため)。
    // 口座への入金としても取り込むと収入が二重になるので除外する。
    { id: uid(), match: "給与", action: "skip" },
    { id: uid(), match: "賞与", action: "skip" },
    { id: uid(), match: "ミツビシ", action: "card", target: "MDC" },
    { id: uid(), match: "JCBカード", action: "card", target: "JAL navi" },
    { id: uid(), match: "セゾン", action: "card", target: "SAISON" },
    { id: uid(), match: "ことら", action: "account", target: "NEOBANK", negItem: "出金", posItem: "入金" },
    { id: uid(), match: "ハイブリッド", action: "account", target: "NEOBANK", negItem: "投資振替", posItem: "投資振替" },
    { id: uid(), match: "ATM", action: "account", target: "NEOBANK", negItem: "引出", posItem: "預入" },
    { id: uid(), match: "エポス", action: "card", target: "EPOS" },
    { id: uid(), match: "PayPa", action: "card", target: "PayPay" },
  ],
  cycleCutoffDay: 10, // 10日締め(11日〜翌月10日を1周期)。土日祝は翌営業日に自動調整
};

// その口座で表示する入出金・振替の種類を返す(未設定なら全種類)
export const flowTypesFor = (account: string, config: Config) => {
  const configured = config && config.accountFlows && config.accountFlows[account];
  if (!configured) return ALL_FLOW_TYPES;
  return configured.includes(INTERNAL_TRANSFER_ITEM) ? configured : [...configured, INTERNAL_TRANSFER_ITEM];
};


// 口座記録の種類。role: bal=残高記録 / in=収入に算入 / out=支出に算入 / transfer=符号そのまま収支に算入
export const ACCOUNT_TYPES = [
  { id: "残高", role: "bal", hint: "口座の残高を記録します" },
  { id: "預入", role: "in", hint: "口座への預け入れ。収入に入ります" },
  { id: "引出", role: "out", hint: "口座からの引き出し。支出に入ります" },
  { id: "入金", role: "in", hint: "送金などの受け取り。収入に入ります" },
  { id: "出金", role: "out", hint: "他所への送金・支払いなど。支出に入ります" },
  { id: "投資振替", role: "transfer", hint: "投資/ハイブリッド口座への振替。入れた分は支出、戻した分は収入" },
  { id: INTERNAL_TRANSFER_ITEM, role: "neutral", hint: "自分の口座間の移動。収支には入りません" },
];

// 旧称「送金」も後方互換で「out」として扱う(migrateEntry/migrateConfigで「出金」へ改称される)
export const acctRole = (item: string): "bal" | "in" | "out" | "transfer" | "neutral" => (ACCOUNT_TYPES.find((t) => t.id === item)?.role as any) || (item === "入金" || item === "受取" || item === "現金預入" || item === "送金受取" ? "in" : item === "出金" || item === "現金引出" || item === "送金" ? "out" : item === "残高" ? "bal" : "out");

// 設定(config)内の口座フロー種別の旧称「受取」を「入金」、「送金」を「出金」に移行し、
// memoCategories(計画タブと連携するメモのカテゴリ)が無ければ既定値を補う
export function migrateConfig(cfg: any): any {
  if (!cfg || typeof cfg !== "object") return cfg;
  let out = cfg;
  const af = cfg.accountFlows;
  if (af && typeof af === "object") {
    const naf: Record<string, string[]> = {};
    for (const [k, arr] of Object.entries(af)) naf[k] = (Array.isArray(arr) ? arr as string[] : []).map((t) => (t === "受取" ? "入金" : t === "送金" ? "出金" : t));
    out = { ...out, accountFlows: naf };
  }
  if (!Array.isArray(out.memoCategories)) out = { ...out, memoCategories: ["交際費"] };
  if (!Array.isArray(out.importRules)) out = { ...out, importRules: [] };
  if (!Array.isArray(out.ownTransferKeywords)) out = { ...out, ownTransferKeywords: [] };
  if (!out.csvAccountMap || typeof out.csvAccountMap !== "object") out = { ...out, csvAccountMap: {} };
  if (!Array.isArray(out.importLinks)) out = { ...out, importLinks: [] };
  // 給与・賞与の除外ルールを一度だけ追加する。版で管理するので、利用者が消したら復活しない。
  if (!(Number(out.importRulesSeeded) >= 1)) {
    const has = (m: string) => (out.importRules || []).some((r: any) => r && r.match === m);
    const add = ["給与", "賞与"].filter((m) => !has(m)).map((m) => ({ id: uid(), match: m, action: "skip" as const }));
    out = { ...out, importRules: [...add, ...(out.importRules || [])], importRulesSeeded: 1 };
  }
  // 利用者名を一度だけ補う。削除後に復活しないよう版で管理する。
  if (!(Number(out.ownTransferKeywordsSeeded) >= 1)) {
    const own = out.ownTransferKeywords || [];
    const has = own.some((k: string) => normalizeOwnName(k) === normalizeOwnName("ハヤシシュンヤ"));
    out = { ...out, ownTransferKeywords: has ? own : [...own, "ハヤシシュンヤ"], ownTransferKeywordsSeeded: 1 };
  }
  // 旧「ことら→取り込まない」は他人との送金・受取まで落としてしまうので、口座の出金/入金へ直す。
  // 自分名義ぶんは ownTransferKeywords で除外する。
  if ((out.importRules || []).some((r: any) => r && r.match === "ことら" && r.action === "skip")) {
    out = { ...out, importRules: out.importRules.map((r: any) => (r && r.match === "ことら" && r.action === "skip"
      ? { ...r, action: "account", target: (out.accounts && out.accounts[0]) || "", negItem: "出金", posItem: "入金" } : r)) };
  }
  // 旧「開始日(cycleStartDay)」→「締め日(cycleCutoffDay=開始日-1)」へ移行
  if (out.cycleCutoffDay == null && out.cycleStartDay != null) {
    const c = Number(out.cycleStartDay) - 1;
    out = { ...out, cycleCutoffDay: c >= 1 ? c : 0 };
  }
  return out;
}


// 1ヶ月分の記録から収支サマリを計算する(サマリ画面・年間の貯蓄率グラフで共用)
export function computeSummary(monthEntries: Entry[]): Summary {
  let gross = 0, deduction = 0, cardTotal = 0, cashIn = 0, cashOut = 0, invest = 0; const balances: Record<string, number> = {};
  for (const e of monthEntries) {
    if (e.cat === "salary") { if (e.item === "控除") deduction += e.amount; else gross += e.amount; }
    else if (e.cat === "card") cardTotal += Math.abs(e.amount);
    else if (e.cat === "account") {
      const role = acctRole(e.item);
      if (role === "bal") balances[e.account || ""] = e.amount;
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


export const DEFAULT_CARDS: Card[] = [
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


export const SEED_ENTRIES: Entry[] = [
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


export const SEED_DEBT: Record<string, Record<string, number>> = {
  "SMCC Gold": { "2026-06": 55140, "2026-07": 54804, "2026-08": 47975, "2026-09": 44041, "2026-10": 37845, "2026-11": 34866, "2026-12": 34480 },
  "smcc": { "2026-06": 294, "2026-07": 294, "2026-08": 294 },
  "JAL navi": { "2026-06": 37284, "2026-07": 37284, "2026-08": 4740 },
  "VIEW": { "2026-06": 37100 },
};


// 収支計算とは無関係の自由メモ(交際費などの覚え書き)の初期データ。カテゴリで小計をまとめる。
export const SEED_MEMOS: Memo[] = [
  { id: uid(), title: "6月 飲み会", amount: 5000, body: "同期と", category: "交際費", ym: "2026-06" },
  { id: uid(), title: "誕生日プレゼント", amount: 7000, body: "", category: "交際費", ym: "2026-06" },
];

// サブスク管理の初期データ。cycle は "monthly"(月額) / "yearly"(年払い)。
// card は所有カード名、renewal は次回更新日(YYYY-MM-DD)。収支には計上しない。
export const SEED_SUBS: Sub[] = [
  { id: uid(), name: "Netflix", amount: 1490, cycle: "monthly", category: "サブスク", card: "SMCC Gold", renewal: "", plan: "スタンダード", note: "" },
  { id: uid(), name: "Spotify", amount: 980, cycle: "monthly", category: "サブスク", card: "", renewal: "", plan: "", note: "" },
  { id: uid(), name: "Amazon Prime", amount: 5900, cycle: "yearly", category: "サブスク", card: "JCB Gold", renewal: "2026-11-01", plan: "年間プラン", note: "" },
  { id: uid(), name: "通信費", amount: 4500, cycle: "monthly", category: "通信", card: "SMCC Gold", renewal: "", plan: "", note: "スマホ" },
];


// ===== 計画(plan) =====
// 年度(4月開始)の12か月の ym を返す
export const planMonths = (fyStart: number): string[] => Array.from({ length: 12 }, (_, i) => { const d = new Date(fyStart, 3 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });

// ym から年度開始年(4月)を求める
export const fyStartOf = (ym: string): number => { const [y, m] = ym.split("-").map(Number); return m >= 4 ? y : y - 1; };

// 計画額(標準月 std ＋ 例外月 over の上書き)
export const planValue = (plan: Plan | null | undefined, key: string, ym: string): number => {
  const l = plan && plan.lines && plan.lines[key];
  if (!l) return 0;
  const v = l.over && l.over[ym] != null ? l.over[ym] : l.std;
  return Number(v) || 0;
};

// ----- 簡素化した計画モデル -----
// 計画は「収入見込み」「変動費見込み」「投資振替見込み」の3本だけを持つ(いずれも標準月std＋例外月over)。
// 支出見込みの総額 = 固定費(定期費=subsから自動集計) + 変動費。固定費は計画に保存せず毎回算出する。
export const PLAN_INCOME = "income";
export const PLAN_VARIABLE = "variable";
export const PLAN_INVEST = "invest";

// サブスク1件の月換算/年換算(月額はそのまま、年払いは/12)
export const subMonthly = (s: Sub): number => (s && s.cycle === "yearly" ? (Number(s.amount) || 0) / 12 : (Number(s && s.amount) || 0));
export const subYearly = (s: Sub): number => (s && s.cycle === "yearly" ? (Number(s.amount) || 0) : (Number(s && s.amount) || 0) * 12);
// 定期費(subs)の月あたり固定費合計。計画の「固定費」はこれを土台にする。
export const fixedMonthly = (subs: Sub[] | null | undefined): number => (subs || []).reduce((a, s) => a + subMonthly(s), 0);

export const plannedIncome = (plan: Plan, ym: string): number => planValue(plan, PLAN_INCOME, ym);
// 変動費の予算枠(旅費/交際費など)。計画に "var|<名前>" 行があればそれらが枠、無ければ単一の変動費。
export const variableBuckets = (plan: Plan | null | undefined): string[] =>
  plan && plan.lines ? Object.keys(plan.lines).filter((k) => k.startsWith("var|")).map((k) => k.slice(4)) : [];
// 変動費見込み。予算枠があれば各枠の合計、無ければ単一の variable 行。
export const plannedVariable = (plan: Plan, ym: string): number => {
  const buckets = variableBuckets(plan);
  if (buckets.length) return buckets.reduce((a, name) => a + planValue(plan, "var|" + name, ym), 0);
  return planValue(plan, PLAN_VARIABLE, ym);
};
export const plannedInvest = (plan: Plan, ym: string): number => planValue(plan, PLAN_INVEST, ym);
// 支出見込み総額 = 固定費(subs) + 変動費見込み
export const plannedSpending = (plan: Plan, subs: Sub[] | null | undefined, ym: string): number => fixedMonthly(subs) + plannedVariable(plan, ym);
// 計画の収支 = 収入 − 支出 + 投資振替(符号のまま)
export const plannedNet = (plan: Plan, subs: Sub[] | null | undefined, ym: string): number => plannedIncome(plan, ym) - plannedSpending(plan, subs, ym) + plannedInvest(plan, ym);

// 旧形式(カード別・口座フロー別に行を持つ計画)かどうか。旧キーは "salary|給与" のように "|" を含む。
const isLegacyPlan = (plan: any): boolean => !!(plan && plan.lines && Object.keys(plan.lines).some((k) => k.includes("|")));

// 旧計画を新モデル(収入/変動費/投資)へ移行する。総額を保つように:
//  収入   = 給与系 + 収入側フロー(預入/入金)の合計
//  変動費 = (カード + 支出側フロー[引出/出金])の合計 − 固定費(subs月換算)。総額=固定費+変動費 が旧支出と一致する
//  投資   = 投資振替(符号のまま)
// メモ(交際費など)の計画行は、カテゴリ比較を廃止したため引き継がない。
export function migratePlan(plan: any, subs: Sub[] | null | undefined): Plan {
  if (!isLegacyPlan(plan)) return (plan && plan.lines) ? plan : { fyStart: plan && plan.fyStart, lines: {} };
  const lines = plan.lines as Record<string, PlanLineData>;
  const keysStarting = (pfx: string) => Object.keys(lines).filter((k) => k.startsWith(pfx));
  const salaryKeys = keysStarting("salary|");
  const cardKeys = keysStarting("card|");
  const incomeFlowKeys = ["flow|預入", "flow|入金"].filter((k) => lines[k]);
  const outFlowKeys = ["flow|引出", "flow|出金"].filter((k) => lines[k]);
  const investKeys = ["flow|投資振替"].filter((k) => lines[k]);
  const fixed = fixedMonthly(subs);
  const sumStd = (keys: string[]) => keys.reduce((a, k) => a + (Number(lines[k].std) || 0), 0);
  const sumAt = (keys: string[], m: string) => keys.reduce((a, k) => a + planValue(plan, k, m), 0);
  const months = new Set<string>();
  for (const k of Object.keys(lines)) for (const m of Object.keys(lines[k].over || {})) months.add(m);
  const income: PlanLineData = { std: sumStd(salaryKeys) + sumStd(incomeFlowKeys), over: {} };
  const variable: PlanLineData = { std: Math.max(0, sumStd(cardKeys) + sumStd(outFlowKeys) - fixed), over: {} };
  const invest: PlanLineData = { std: sumStd(investKeys), over: {} };
  for (const m of months) {
    const iv = sumAt(salaryKeys.concat(incomeFlowKeys), m); if (iv !== income.std) income.over[m] = iv;
    const vv = Math.max(0, sumAt(cardKeys.concat(outFlowKeys), m) - fixed); if (vv !== variable.std) variable.over[m] = vv;
    const nv = sumAt(investKeys, m); if (nv !== invest.std) invest.over[m] = nv;
  }
  return { fyStart: plan.fyStart, lines: { [PLAN_INCOME]: income, [PLAN_VARIABLE]: variable, [PLAN_INVEST]: invest } };
}

// その月に何らかの入力(記録またはその月のメモ)があるか。
// 見通しでは、入力が始まった月の空欄行に計画値を流し込まず実績(0)扱いにする判定に使う。
export const monthHasInput = (monthEntries: Entry[], memos: Memo[], ym: string): boolean =>
  monthEntries.length > 0 || (memos || []).some((m) => m.ym === ym);

// その月に残高記録があるか / 残高計
export const hasBalRecord = (monthEntries: Entry[]): boolean => monthEntries.some((e) => e.cat === "account" && acctRole(e.item) === "bal");
export const balTotalOf = (monthEntries: Entry[]): number => monthEntries.reduce((a, e) => a + (e.cat === "account" && acctRole(e.item) === "bal" ? e.amount : 0), 0);

// 月の「締め」フラグ。締めた月は、記録が無い項目も「0円で確定」とみなし
// (入力もれ=未入力ではなく実際に無かった、と判断)、見通しで計画に頼らず実績を優先させる。
export const isMonthClosed = (closedMonths: string[] | null | undefined, ym: string): boolean => Array.isArray(closedMonths) && closedMonths.includes(ym);
export const toggleMonthClosed = (closedMonths: string[] | null | undefined, ym: string): string[] => {
  const set = new Set(Array.isArray(closedMonths) ? closedMonths : []);
  if (set.has(ym)) set.delete(ym); else set.add(ym);
  return [...set].sort();
};

// 1か月分の 計画/実績(収入・支出・収支)と差を算出(今月タブの使いすぎ判定・計画対比に使う)。
// 実績はその月の記録から computeSummary で集計、計画は簡素化モデル(収入/固定費+変動費/投資)から。
export function planVsActualForMonth(plan: Plan, subs: Sub[] | null | undefined, monthEntries: Entry[], ym: string): PlanVsActual {
  const s = computeSummary(monthEntries);
  const planIncome = plannedIncome(plan, ym);
  const planSpending = plannedSpending(plan, subs, ym);
  const planNet = plannedNet(plan, subs, ym);
  const actualIncome = s.income;
  const actualSpending = s.expense;   // カード請求＋現金出金(正の額)
  const actualNet = s.net;
  return { planIncome, actualIncome, planSpending, actualSpending, planNet, actualNet, diff: actualNet - planNet };
}

export interface AnnualOutlook {
  fyStart: number;       // 年度開始年(4月)
  netForecast: number;   // 年度の収支(累計)見込み: 実績が入った月は実績、未入力の月は計画
  actualNet: number;     // うち実績で確定した分の収支
  balStart: number;      // 年度開始前月の残高合計(アンカー)
  balEnd: number;        // 年度末の残高見込み
}

// 今の月(ym)が属する年度について、年度末の収支(累計)と残高の見込みを算出する。
// 入力が始まった/締めた月は実績、未入力の月は計画。残高は実績記録があればアンカーし、無ければ収支で試算。
export function annualOutlook(plan: Plan, subs: Sub[] | null | undefined, entries: Entry[], closedMonths: string[] | null | undefined, ym: string): AnnualOutlook {
  const fyStart = fyStartOf(ym);
  const months = planMonths(fyStart);
  const byMonth: Record<string, Entry[]> = {}; for (const m of months) byMonth[m] = [];
  for (const e of entries) if (byMonth[e.ym]) byMonth[e.ym].push(e);
  const prevMo = addMonth(months[0], -1);
  const balStart = entries.reduce((a, e) => a + (e.ym === prevMo && e.cat === "account" && e.item === "残高" ? e.amount : 0), 0);
  let bal = balStart, netForecast = 0, actualNet = 0;
  for (const mo of months) {
    const es = byMonth[mo];
    const isActual = isMonthClosed(closedMonths, mo) || es.length > 0;
    const net = isActual ? computeSummary(es).net : plannedNet(plan, subs, mo);
    netForecast += net;
    if (isActual) actualNet += net;
    if (hasBalRecord(es)) bal = balTotalOf(es); else bal += net;
  }
  return { fyStart, netForecast, actualNet, balStart, balEnd: bal };
}

export interface CardBreakdownRow {
  name: string;
  total: number;        // その月のカード請求額(絶対値)
  debtPortion: number;  // うち残債(分割払い)のスケジュール分
  otherPortion: number; // 残債以外(通常利用分)
  linkedMemos: Memo[];  // このカードに紐づくメモ(収支には影響しない参考情報)
}

export interface DebtDetail { id?: string; label?: string; amount: number; }
export interface DebtValue { items: DebtDetail[]; }

// 旧形式の数値と、内訳を持つ新形式の両方から合計額を得る。
export const debtValueTotal = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value || typeof value !== "object" || !Array.isArray((value as DebtValue).items)) return 0;
  return (value as DebtValue).items.reduce((sum, item) => sum + (Number(item && item.amount) || 0), 0);
};

// カード請求額を「残債(分割払いのスケジュール分)」と「それ以外」に分けた内訳。
// サマリのカード請求セルをタップした時の展開表示に使う。金額のみで収支計算には影響しない。
export function cardBreakdown(cards: Card[], debt: Record<string, Record<string, unknown>>, memos: Memo[], monthEntries: Entry[], ym: string): CardBreakdownRow[] {
  return (cards || [])
    .map((c) => {
      const total = monthEntries.reduce((a, e) => a + (e.cat === "card" && e.item === c.name ? Math.abs(e.amount) : 0), 0);
      const debtPortion = Math.min(total, debtValueTotal(debt && debt[c.name] && debt[c.name][ym]));
      const otherPortion = Math.max(0, total - debtPortion);
      const linkedMemos = (memos || []).filter((m) => m.linkedCard === c.name && (!m.ym || m.ym === ym));
      return { name: c.name, total, debtPortion, otherPortion, linkedMemos };
    })
    .filter((r) => r.total > 0 || r.linkedMemos.length > 0);
}

// ===== スクショ取込(OCR明細インポート) =====
export interface ParsedTxn { date: string; desc: string; amount: number; }

// 銀行アプリの明細画面から、日付の表し方が2通りあるテキストを取引ごとへ分解する。
// (a) 取引ごとに"YYYY.MM.DD"の行が付く形式(ゆうちょアプリ等)
// (b) "N日"の見出し1つに複数の取引がぶら下がる形式(NEOBANK等)。年月の表記が無いため、
//     呼び出し側が今表示中の月(contextYm)を渡す。日付が前の取引より大きくなったら
//     (新しい順に並ぶ一覧を遡っていて前月に入った、とみなして)月を1つ戻す。
// OCRは¥を"\"や"Y"に、-を"_"に誤読したり、桁区切りの","と"."を混同したり、
// "円"を全く別の漢字(哲/折/四など、実機で確認)に誤読したりするため、行の途中にある
// 金額トークンも拾えるようにし、"円"自体は無くても3桁区切りの数字パターンで金額と判定する。
const IMPORT_DATE_RE = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/;
const IMPORT_DAY_RE = /^(\d{1,2})\s*日$/;
// 符号(-/−/ー/_、または明示的な+) + [円マーク相当(¥/\/Y)+数字 または 3桁区切りの数字(+末尾の単位らしき1〜2文字、何でもよい)]
const MONEY_TOKEN_RE = /(?:([-−ー_])|\+)?\s*(?:[¥\\Y]\s*(\d(?:[\d,.\s]*\d)?)|(\d{1,3}(?:[,.]\d{3})+)\s*[^\d\s]{0,2})/;
const parseMoneyToken = (m: RegExpMatchArray): number => {
  const neg = !!m[1];
  const digits = (m[2] || m[3] || "").replace(/\D/g, "");
  const v = Number(digits) || 0;
  return neg ? -v : v;
};

export function parseBankText(text: string, contextYm?: string): ParsedTxn[] {
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedTxn[] = [];
  let curYm = contextYm || "";
  let prevDay: number | null = null;
  let currentDate: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fullMatch = line.match(IMPORT_DATE_RE);
    if (fullMatch) {
      currentDate = `${fullMatch[1]}-${fullMatch[2].padStart(2, "0")}-${fullMatch[3].padStart(2, "0")}`;
      curYm = currentDate.slice(0, 7);
      prevDay = Number(fullMatch[3]);
      i++;
      continue;
    }
    const dayMatch = line.match(IMPORT_DAY_RE);
    if (dayMatch && curYm) {
      const day = Number(dayMatch[1]);
      if (prevDay !== null && day > prevDay) curYm = addMonth(curYm, -1);
      prevDay = day;
      currentDate = `${curYm}-${String(day).padStart(2, "0")}`;
      i++;
      continue;
    }
    if (!currentDate) { i++; continue; } // 最初の日付/日見出しより前の行(ヘッダー等)は無視
    const descParts: string[] = [];
    let amount: number | null = null;
    let linesForTxn = 0;
    // 取引額が見つかるまで摘要として蓄積し、見つけた直後の1行(残高)まで読んだら打ち切る。
    // 金額を検出した後に金額を含まない行が来たら、それはフッターのナビ文字等の無関係な行なので
    // 摘要に巻き込まずそこで打ち切る(取引額が見つかる前の行数にも上限を設け、暴走を防ぐ)。
    while (i < lines.length && !IMPORT_DATE_RE.test(lines[i]) && !IMPORT_DAY_RE.test(lines[i]) && linesForTxn < 4) {
      const l2 = lines[i];
      const mm = l2.match(MONEY_TOKEN_RE);
      if (!mm || mm.index == null) {
        if (amount !== null) break;
        descParts.push(l2);
        linesForTxn++; i++;
        continue;
      }
      const before = l2.slice(0, mm.index).trim();
      linesForTxn++; i++;
      if (amount === null) {
        if (before) descParts.push(before);
        amount = parseMoneyToken(mm);
      } else {
        // 2つ目の金額(残高)を読んだら終了。"残高"ラベル(前後にOCRノイズが付くこともある)は
        // 摘要に含めないが、それ以外の文字が残っている場合は折り返した摘要の続きの可能性があるので拾う。
        if (before && !before.replace(/\s/g, "").includes("残高")) descParts.push(before);
        break;
      }
    }
    if (amount === null) continue; // 金額を検出できなかった行は取引として扱わない
    out.push({ date: currentDate, desc: descParts.join(""), amount });
  }
  return out;
}

// 濁点・半濁点付きの仮名を清音に戻す変換表。OCRが濁点を落としたり独立記号として誤読するため、
// 摘要のキーワード照合をこの表で正規化してから行い、多少の誤読があってもマッチできるようにする。
const DAKUTEN_MAP: Record<string, string> = {
  ガ: "カ", ギ: "キ", グ: "ク", ゲ: "ケ", ゴ: "コ",
  ザ: "サ", ジ: "シ", ズ: "ス", ゼ: "セ", ゾ: "ソ",
  ダ: "タ", ヂ: "チ", ヅ: "ツ", デ: "テ", ド: "ト",
  バ: "ハ", ビ: "ヒ", ブ: "フ", ベ: "ヘ", ボ: "ホ",
  パ: "ハ", ピ: "ヒ", プ: "フ", ペ: "ヘ", ポ: "ホ",
  ヴ: "ウ",
  が: "か", ぎ: "き", ぐ: "く", げ: "け", ご: "こ",
  ざ: "さ", じ: "し", ず: "す", ぜ: "せ", ぞ: "そ",
  だ: "た", ぢ: "ち", づ: "つ", で: "て", ど: "と",
  ば: "は", び: "ひ", ぶ: "ふ", べ: "へ", ぼ: "ほ",
  ぱ: "は", ぴ: "ひ", ぷ: "ふ", ぺ: "へ", ぽ: "ほ",
};
// OCRが濁点を独立記号として誤読した際に残るノイズ文字(結合濁点/半濁点も含む)
const OCR_NOISE_RE = /[*`'^゙゚]/g;

// 摘要・ルールのキーワードを、キーワード照合用に正規化する(全角/半角・空白・OCRノイズ・濁点ゆれを吸収)
export function normalizeForMatch(s: string): string {
  const stripped = (s || "").normalize("NFKC").replace(/\s/g, "").replace(OCR_NOISE_RE, "");
  return Array.from(stripped).map((ch) => DAKUTEN_MAP[ch] || ch).join("");
}

// 銀行CSVでは小書きカナが大きいカナで出ることがあるため、氏名照合時だけ同一視する。
function normalizeOwnName(s: string): string {
  return normalizeForMatch(s).replace(/[ァィゥェォッャュョヮ]/g, (ch) => ({
    "ァ": "ア", "ィ": "イ", "ゥ": "ウ", "ェ": "エ", "ォ": "オ",
    "ッ": "ツ", "ャ": "ヤ", "ュ": "ユ", "ョ": "ヨ", "ヮ": "ワ",
  } as Record<string, string>)[ch] || ch);
}

// ── CSV取込 ────────────────────────────────────────────────
// 銀行・カード会社の明細CSVを取り込む。OCRと違い金額・日付が正確で、
// 多くの銀行CSVは残高列を持つため月末残高まで自動で取れる(入力が不要になる)。

// RFC4180ふう。ダブルクォート内のカンマ・改行・""(エスケープ)を扱う。
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  const s = String(text || "").replace(/^﻿/, ""); // BOM除去
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// 日付セルを YYYY-MM-DD へ。"2026/7/5"・"2026-07-05"・"20260705"・"26/7/5" を許容。
export function normalizeCsvDate(raw: string): string | null {
  const s = String(raw || "").trim().replace(/[年月]/g, "/").replace(/日/g, "");
  let m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})/); // 2桁年は20xx年とみなす
  if (m) return `20${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

// 金額セル → 数値。"1,234"・"¥1,234"・"△1,234"/"▲1,234"(和文のマイナス)・"(1,234)" を扱う。空はnull。
export function parseCsvAmount(raw: string): number | null {
  let s = String(raw || "").trim();
  if (s === "" || s === "-" || s === "―") return null;
  let neg = false;
  if (/^[△▲]/.test(s)) { neg = true; s = s.slice(1); }
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[¥￥,，\s円]/g, "").replace(/[－−ー]/g, "-");
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

const CSV_HEAD = {
  date: ["日付", "取引日", "ご利用日", "お取引日", "利用日", "計上日", "date"],
  // 摘要は銀行により複数列に分かれる(ゆうちょは詳細1=種別・詳細2=相手名)。該当列は全部つないで使う。
  desc: ["摘要", "内容", "取引内容", "お取引内容", "ご利用店名", "ご利用先", "利用店名", "店名", "詳細", "備考", "description"],
  out: ["出金", "お引出", "引出", "払出", "支払金額", "お支払金額", "ご利用金額", "利用金額", "出金金額", "withdrawal"],
  inc: ["入金", "お預入", "預入", "受入", "入金金額", "deposit"],
  amount: ["金額", "取引金額", "amount"],
  balance: ["残高", "差引残高", "現在高", "balance"],
};
const headName = (h: string) => String(h || "").replace(/[（(].*?[)）]/g, "").replace(/\s/g, "");
const headIndex = (headers: string[], keys: string[]) =>
  headers.findIndex((h) => { const n = headName(h); return keys.some((k) => n.includes(k)); });
// 金額列を探すときに除外する見出し。例: ゆうちょの「入出金明細ＩＤ」は「出金」を含むため、
// 単純な部分一致だと明細IDを金額として読んでしまう。
const AMOUNT_HEAD_NG = /(ＩＤ|ID|番号|明細|コード|区分)/i;
const headIndexAmount = (headers: string[], keys: string[]) =>
  headers.findIndex((h) => { const n = headName(h); if (AMOUNT_HEAD_NG.test(n)) return false; return keys.some((k) => n.includes(k)); });
// 該当する列を全部返す(摘要が複数列に分かれる形式のため)
const headIndexAll = (headers: string[], keys: string[]) =>
  headers.map((h, i) => (keys.some((k) => headName(h).includes(k)) ? i : -1)).filter((i) => i >= 0);

// 残高の検算結果。CSVの残高列が「手前の残高＋取引＝その行の残高」で繋がるかを見る。
export interface BalanceMismatch { date: string; desc: string; expected: number; actual: number; }
export interface BalanceCheck { checked: number; mismatched: number; firstMismatch?: BalanceMismatch; }

export interface CsvImportResult {
  txns: ParsedTxn[];
  balance: { date: string; amount: number } | null;  // CSVに残高列があれば最新日の残高
  balanceCheck?: BalanceCheck | null;                // 残高の連なりによる検算(残高列が無ければnull)
  preamble: string;   // ヘッダー行より前の前書き(口座名などが書かれている。振り分け先の推定に使う)
  signature?: string; // この明細の出所を表す目印(口座番号、無ければ列構成)。一度選んだ口座を覚えるための鍵
  error?: string;
}

// 明細CSVを取引の配列へ。ヘッダー行は先頭20行から自動判定する(前置きのある銀行CSVに対応)。
// 出金/入金が別列なら符号を合成し、金額1列ならその符号をそのまま使う。
// カード明細のように符号が無く支払のみのCSVは、呼び出し側で「カード」に分類すれば絶対値で扱われる。
export function parseBankCsv(text: string): CsvImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { txns: [], balance: null, balanceCheck: null, preamble: "", error: "CSVを読み取れませんでした" };
  let hi = -1, headers: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i];
    if (headIndex(r, CSV_HEAD.date) >= 0 && (headIndexAmount(r, CSV_HEAD.out) >= 0 || headIndexAmount(r, CSV_HEAD.inc) >= 0 || headIndexAmount(r, CSV_HEAD.amount) >= 0)) { hi = i; headers = r; break; }
  }
  const preamble = rows.slice(0, Math.max(0, hi < 0 ? Math.min(rows.length, 5) : hi)).map((r) => r.join(" ")).join("\n");
  if (hi < 0) return { txns: [], balance: null, balanceCheck: null, preamble, error: "日付・金額の列が見つかりませんでした。別の形式のCSVかもしれません。" };
  const di = headIndex(headers, CSV_HEAD.date);
  const sis = headIndexAll(headers, CSV_HEAD.desc);
  const oi = headIndexAmount(headers, CSV_HEAD.out);
  const ii = headIndexAmount(headers, CSV_HEAD.inc);
  const ai = headIndexAmount(headers, CSV_HEAD.amount);
  const bi = headIndexAmount(headers, CSV_HEAD.balance);

  const txns: ParsedTxn[] = [];
  // 残高は取引と同じ並び・同じ添字で保持する。最後に「新しい順/古い順」を判定して
  // 最新の残高を選び、さらに残高の連なりで検算する(同じ日に複数行あっても取り違えない)。
  const bals: (number | null)[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeCsvDate(r[di] || "");
    if (!date) continue;
    let amount: number | null = null;
    if (oi >= 0 || ii >= 0) {
      const out = oi >= 0 ? parseCsvAmount(r[oi] || "") : null;
      const inc = ii >= 0 ? parseCsvAmount(r[ii] || "") : null;
      if (out != null && out !== 0) amount = -Math.abs(out);
      else if (inc != null && inc !== 0) amount = Math.abs(inc);
    }
    if (amount == null && ai >= 0) amount = parseCsvAmount(r[ai] || "");
    if (amount == null || amount === 0) continue;
    const desc = sis.map((k) => String(r[k] || "").trim()).filter(Boolean).join(" ");
    txns.push({ date, desc, amount });
    bals.push(bi >= 0 ? parseCsvAmount(r[bi] || "") : null);
  }
  // 並び順の判定: 先頭の取引日が末尾より新しければ「新しい順」なので先頭が最新の残高。
  const descending = txns.length > 1 && txns[0].date > txns[txns.length - 1].date;
  const latestIdx = descending ? bals.findIndex((b) => b != null) : bals.length - 1 - [...bals].reverse().findIndex((b) => b != null);
  // この明細の出所を表す目印。口座番号があればそれ(口座ごとに一意)、無ければ列構成(銀行ごとに一意)。
  const acctNo = (preamble.match(/\d{4,}[-\d]{4,}/) || [])[0];
  const signature = acctNo || headers.map((h) => headName(h)).filter(Boolean).join("|");

  const balance = bals.some((b) => b != null) && latestIdx >= 0 && bals[latestIdx] != null
    ? { date: txns[latestIdx].date, amount: bals[latestIdx] as number } : null;

  // 残高で検算する。隣り合う行は「手前の残高 + その取引 = その行の残高」が成り立つはずなので、
  // 合わなければ読み取り違い・取りこぼしがある。取り込む前に気付けるようにする。
  let checked = 0, mismatched = 0;
  let firstMismatch: BalanceMismatch | undefined;
  for (let i = 0; i < txns.length; i++) {
    const prevIdx = descending ? i + 1 : i - 1;   // 時系列でひとつ前の行
    if (prevIdx < 0 || prevIdx >= txns.length) continue;
    const prev = bals[prevIdx], cur = bals[i];
    if (prev == null || cur == null) continue;
    checked++;
    const expected = prev + txns[i].amount;
    if (Math.abs(expected - cur) >= 1) {
      mismatched++;
      if (!firstMismatch) firstMismatch = { date: txns[i].date, desc: txns[i].desc, expected, actual: cur };
    }
  }
  const balanceCheck: BalanceCheck | null = checked > 0 ? { checked, mismatched, firstMismatch } : null;

  if (txns.length === 0) return { txns: [], balance, balanceCheck, preamble, signature, error: "取引を1件も読み取れませんでした" };
  return { txns, balance, balanceCheck, preamble, signature };
}

export interface TxnClassification { action: "card" | "account" | "skip"; target?: string; negItem?: string; posItem?: string; }

// 摘要をルールに照らして分類する(登録順で先勝ち)。マッチ無しはnull(要手動判定)。
export function classifyTxn(desc: string, rules: ImportRule[] | undefined): TxnClassification | null {
  const nd = normalizeForMatch(desc);
  for (const r of rules || []) {
    if (r.match && nd.includes(normalizeForMatch(r.match))) return { action: r.action, target: r.target, negItem: r.negItem, posItem: r.posItem };
  }
  return null;
}

// 取込で受け取った文字列を実際のCSVへ復元する。ショートカット経由では
// Base64(バイト列のまま)で渡ってくることがあり、銀行CSVはShift_JISが多いので
// 文字コードの判定もここで行う。Base64でなければそのまま返す。
export function decodeImportPayload(raw: string): string {
  const s = String(raw || "");
  // URL安全なBase64(-と_)も受け付ける
  const compact = s.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  // Base64以外の文字が混ざっていれば、そのままのCSVとみなす(CSVには必ずカンマや改行が入る)
  if (compact.length < 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return s;
  try {
    const bin = typeof atob === "function" ? atob(compact) : "";
    if (!bin) return s;
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("\uFFFD")) { try { text = new TextDecoder("shift_jis").decode(bytes); } catch {} }
    // 復号結果がCSVらしくなければ、元の文字列の方が正しい
    return text.includes(",") ? text : s;
  } catch { return s; }
}

// 摘要が自分名義(設定のキーワード)かどうか。表記ゆれ・半角カナはNFKCで吸収する。
export const matchesOwnName = (desc: string, keywords: string[] | undefined): boolean => {
  const nd = normalizeOwnName(desc);
  return (keywords || []).some((k) => { const nk = normalizeOwnName(k); return !!nk && nd.includes(nk); });
};

// 口座間振替の候補。group は「どの口座の明細か」(取り込むCSVのファイル単位)。
export interface TransferCandidate { date: string; amount: number; group: string | number; own: boolean; }

// 自分名義の取引どうしを「同じ日・同額・逆符号・別口座」で突き合わせ、1組になったものを
// 口座間の振替とみなす。組になった相手の添字を返す(相手なしは -1)。
// 名義だけで一律に除外すると、同じ名字の他人とのやり取りまで消えてしまうため、
// 反対側の記録が実在することを条件にする。
export function pairOwnTransfers(items: TransferCandidate[]): number[] {
  const partner = items.map(() => -1);
  for (let i = 0; i < items.length; i++) {
    if (!items[i].own || partner[i] >= 0) continue;
    for (let j = 0; j < items.length; j++) {
      if (j === i || !items[j].own || partner[j] >= 0) continue;
      if (items[j].group === items[i].group) continue;      // 同じ口座の中の動きは振替ではない
      if (items[j].date !== items[i].date) continue;
      if (items[j].amount !== -items[i].amount) continue;    // 出た額と入った額が一致
      partner[i] = j; partner[j] = i;
      break;
    }
  }
  return partner;
}

// 取込元の明細を一意に表す指紋。CSVの期間が重なっても同じ取引を二重登録しないために使う。
// 摘要は表記ゆれ・OCRの揺れを吸収した正規化後の先頭部分だけを使う。
export const txnKey = (txn: ParsedTxn): string => `${txn.date}|${Math.round(txn.amount)}|${normalizeForMatch(txn.desc).slice(0, 24)}`;

// 指紋(src)から取込元の日付・金額・摘要を取り出す。過去に取り込んだ記録を
// 振替の相手として突き合わせるために使う(entryは日付を持たないため指紋から復元する)。
export function parseTxnKey(src: string | undefined): { date: string; amount: number; desc: string } | null {
  if (!src) return null;
  const m = String(src).match(/^(\d{4}-\d{2}-\d{2})\|(-?\d+)\|(.*)$/);
  if (!m) return null;
  return { date: m[1], amount: Number(m[2]), desc: m[3] };
}

// 分類結果をentry(id無し)に変換する。skip・未分類・対象未選択はnull。
// cutoffDay(締め日)を渡すと、取引日をその周期の月バケツへ自動で振り分ける(例: 締め日10で7/5→6月度)。
export function txnToEntry(txn: ParsedTxn, cls: TxnClassification | null, cutoffDay: number = 0): Omit<Entry, "id"> | null {
  if (!cls || cls.action === "skip") return null;
  if ((cls.action === "card" || cls.action === "account") && !cls.target) return null;
  const ym = cycleYm(txn.date, cutoffDay);
  const src = txnKey(txn);
  if (cls.action === "card") return { ym, cat: "card", item: cls.target!, account: "", amount: Math.abs(txn.amount), src };
  const item = txn.amount < 0 ? (cls.negItem || "出金") : (cls.posItem || "入金");
  return { ym, cat: "account", item, account: cls.target!, amount: txn.amount, src };
}

// 更新日(YYYY-MM-DD)を1周期ぶん進める。monthlyは月末クランプに注意しJSのDateに委ねる。
export function advanceRenewalDate(dateStr: string, cycle: "monthly" | "yearly"): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (cycle === "yearly") { const dt = new Date(y + 1, m - 1, d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; }
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// 更新日が過ぎているサブスクを、今日以降になるまで自動で繰り越す(周期分ずつ進める)。
// 変更が無ければ同じ配列参照を返す(呼び出し側で再保存要否を判定できる)。
export function rollForwardSubs(subs: Sub[], todayStr?: string): Sub[] {
  const today = todayStr || new Date().toISOString().slice(0, 10);
  let changed = false;
  const next = subs.map((s) => {
    if (!s.renewal) return s;
    let r = s.renewal, guard = 0;
    while (r < today && guard < 240) { r = advanceRenewalDate(r, s.cycle); guard++; }
    if (r !== s.renewal) { changed = true; return { ...s, renewal: r }; }
    return s;
  });
  return changed ? next : subs;
}

// 初期計画(スプレッドシートを参考にした標準月＋一部上書き)。年度は当該データに合わせ2026。
// 簡素化した計画の初期データ。収入見込み・変動費見込み・投資振替見込みの3本のみ。
// 固定費は定期費(subs)から自動集計するので計画には持たない。賞与や大きな入金は over で月別に上書き。
export const SEED_PLAN: Plan = {
  fyStart: 2026,
  lines: {
    income: { std: 248000, over: { "2026-06": 357000, "2026-07": 306000, "2026-11": 1348000, "2027-01": 868000 } },
    variable: { std: 149000, over: { "2026-06": 139000 } },
    invest: { std: -46000, over: {} },
  },
};


export interface StructureNode { cat: string; item: string; account: string; entries: Entry[]; }

// 月データを、元incomeと同じ並びの「項目リスト」に整える(0円項目も含む)
export function buildStructure(monthEntries: Entry[], config: Config, cards: Card[]) {
  const byKey: Record<string, StructureNode> = {}; // key -> {item, account, cat, entries[]}
  const push = (cat: string, item: string, account: string, e?: Entry) => {
    const key = cat + "|" + item + "|" + (account || "");
    if (!byKey[key]) byKey[key] = { cat, item, account: account || "", entries: [] };
    if (e) byKey[key].entries.push(e);
  };
  // 先に器を用意(0円でも表示するため)
  (config.salaryItems || []).forEach((it) => push("salary", it, ""));
  (cards || []).forEach((c) => push("card", c.name, ""));
  const accounts = config.accounts || [];
  const flowsFor = (a: string) => flowTypesFor(a, config);
  accounts.forEach((a) => flowsFor(a).forEach((t) => push("account", t, a)));
  accounts.forEach((a) => push("account", "残高", a));
  // 実データを流し込む(器に無い項目=旧データも動的に追加)
  for (const e of monthEntries) push(e.cat, e.item, e.cat === "account" ? (e.account || "") : "", e);
  const totalOf = (key: string) => byKey[key].entries.reduce((a, e) => a + e.amount, 0);
  const get = (cat: string, item: string, account?: string): StructureNode => byKey[cat + "|" + item + "|" + (account || "")] || { entries: [], cat, item, account: account || "" };
  return { byKey, totalOf, get, accounts, flowsFor, flowTypes: ALL_FLOW_TYPES };
}
