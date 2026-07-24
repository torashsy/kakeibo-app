// ===== データモデル =====
export type Cat = "salary" | "card" | "account";

export interface Entry {
  id?: string;
  ym: string;          // "YYYY-MM"
  cat: Cat;
  item: string;
  account?: string;
  amount: number;
}

export interface Config {
  accounts: string[];
  salaryItems: string[];
  accountFlows?: Record<string, string[]>;
  memoCategories?: string[]; // メモのカテゴリのうち、計画タブで目安/実績を追跡するもの
  importRules?: ImportRule[]; // スクショ取込で摘要から自動振り分けするルール(先勝ち)
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

export const ymLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${y}年${parseInt(m, 10)}月`; };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const addMonth = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };


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
export const ALL_FLOW_TYPES: string[] = ["預入", "入金", "引出", "出金", "投資振替"];

export const DEFAULT_CONFIG: Config = {
  accounts: ["ゆうちょ", "NEOBANK", "JRE BANK"],
  salaryItems: ["給与", "手当", "賞与", "控除"],
  // 口座ごとに表示する入出金・振替の種類(未指定の口座は全種類を表示)
  accountFlows: {
    "ゆうちょ": ["預入", "入金", "引出", "出金"],   // 投資振替は使わない
    "JRE BANK": ["入金", "出金", "投資振替"],        // 預入・引出は使わない
  },
  memoCategories: ["交際費"],
  // スクショ取込の初期ルール例(自払=カード引き落とし、ことら=自分名義の口座間送金なので未計上)
  importRules: [
    { id: uid(), match: "ミツビシ", action: "card", target: "MDC" },
    { id: uid(), match: "JCBカード", action: "card", target: "JAL navi" },
    { id: uid(), match: "セゾン", action: "card", target: "SAISON" },
    { id: uid(), match: "ことら", action: "skip" },
    { id: uid(), match: "ハイブリッド", action: "account", target: "NEOBANK", negItem: "投資振替", posItem: "投資振替" },
    { id: uid(), match: "ATM", action: "account", target: "NEOBANK", negItem: "引出", posItem: "預入" },
    { id: uid(), match: "エポス", action: "card", target: "EPOS" },
    { id: uid(), match: "PayPa", action: "card", target: "PayPay" },
  ],
};

// その口座で表示する入出金・振替の種類を返す(未設定なら全種類)
export const flowTypesFor = (account: string, config: Config) => (config && config.accountFlows && config.accountFlows[account]) || ALL_FLOW_TYPES;


// 口座記録の種類。role: bal=残高記録 / in=収入に算入 / out=支出に算入 / transfer=符号そのまま収支に算入
export const ACCOUNT_TYPES = [
  { id: "残高", role: "bal", hint: "口座の残高を記録します" },
  { id: "預入", role: "in", hint: "口座への預け入れ。収入に入ります" },
  { id: "引出", role: "out", hint: "口座からの引き出し。支出に入ります" },
  { id: "入金", role: "in", hint: "送金などの受け取り。収入に入ります" },
  { id: "出金", role: "out", hint: "他所への送金・支払いなど。支出に入ります" },
  { id: "投資振替", role: "transfer", hint: "投資/ハイブリッド口座への振替。入れた分は支出、戻した分は収入" },
];

// 旧称「送金」も後方互換で「out」として扱う(migrateEntry/migrateConfigで「出金」へ改称される)
export const acctRole = (item: string): "bal" | "in" | "out" | "transfer" => (ACCOUNT_TYPES.find((t) => t.id === item)?.role as any) || (item === "入金" || item === "受取" || item === "現金預入" || item === "送金受取" ? "in" : item === "出金" || item === "現金引出" || item === "送金" ? "out" : item === "残高" ? "bal" : "out");

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
export const plannedVariable = (plan: Plan, ym: string): number => planValue(plan, PLAN_VARIABLE, ym);
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

export interface TxnClassification { action: "card" | "account" | "skip"; target?: string; negItem?: string; posItem?: string; }

// 摘要をルールに照らして分類する(登録順で先勝ち)。マッチ無しはnull(要手動判定)。
export function classifyTxn(desc: string, rules: ImportRule[] | undefined): TxnClassification | null {
  const nd = normalizeForMatch(desc);
  for (const r of rules || []) {
    if (r.match && nd.includes(normalizeForMatch(r.match))) return { action: r.action, target: r.target, negItem: r.negItem, posItem: r.posItem };
  }
  return null;
}

// 分類結果をentry(id無し)に変換する。skip・未分類・対象未選択はnull。
export function txnToEntry(txn: ParsedTxn, cls: TxnClassification | null): Omit<Entry, "id"> | null {
  if (!cls || cls.action === "skip") return null;
  if ((cls.action === "card" || cls.action === "account") && !cls.target) return null;
  const ym = txn.date.slice(0, 7);
  if (cls.action === "card") return { ym, cat: "card", item: cls.target!, account: "", amount: Math.abs(txn.amount) };
  const item = txn.amount < 0 ? (cls.negItem || "出金") : (cls.posItem || "入金");
  return { ym, cat: "account", item, account: cls.target!, amount: txn.amount };
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
