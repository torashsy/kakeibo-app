import { describe, it, expect } from "vitest";
import {
  yen, num, addMonth, ymLabel,
  migrateEntry, migrateConfig, acctRole, flowTypesFor, computeSummary,
  planMonths, fyStartOf, planValue, actualForLine, hasActualForLine,
  hasBalRecord, balTotalOf, planLines, planGroupSign, DEFAULT_CONFIG,
  planVsActualForMonth, advanceRenewalDate, rollForwardSubs,
  migratePlan, fixedMonthly, plannedSpending,
  isMonthClosed, toggleMonthClosed, cardBreakdown, monthHasInput, debtValueTotal,
  parseBankText, classifyTxn, txnToEntry, normalizeForMatch,
  type Entry, type Memo, type Card, type Config, type Plan, type Sub, type ImportRule,
} from "./utils";

describe("整形", () => {
  it("yen: 正負とカンマ", () => {
    expect(yen(1234567)).toBe("¥1,234,567");
    expect(yen(-500)).toBe("-¥500");
    expect(yen(0)).toBe("¥0");
  });
  it("num: 四捨五入とカンマ", () => {
    expect(num(1234.6)).toBe("1,235");
    expect(num(null)).toBe("");
  });
  it("addMonth: 年またぎ", () => {
    expect(addMonth("2026-12", 1)).toBe("2027-01");
    expect(addMonth("2026-01", -1)).toBe("2025-12");
    expect(addMonth("2026-06", 0)).toBe("2026-06");
  });
  it("ymLabel", () => expect(ymLabel("2026-06")).toBe("2026年6月"));
});

describe("残債", () => {
  it("旧形式の数値と新形式の内訳を合計できる", () => {
    expect(debtValueTotal(12000)).toBe(12000);
    expect(debtValueTotal({ items: [{ label: "端末", amount: 3000 }, { label: "家具", amount: 4500 }] })).toBe(7500);
    expect(debtValueTotal(null)).toBe(0);
  });
});

describe("acctRole / flowTypesFor", () => {
  it("役割の割当", () => {
    expect(acctRole("残高")).toBe("bal");
    expect(acctRole("預入")).toBe("in");
    expect(acctRole("入金")).toBe("in");
    expect(acctRole("引出")).toBe("out");
    expect(acctRole("出金")).toBe("out");
    expect(acctRole("投資振替")).toBe("transfer");
  });
  it("旧称「受取」も収入として後方互換", () => expect(acctRole("受取")).toBe("in"));
  it("旧称「送金」も支出として後方互換", () => expect(acctRole("送金")).toBe("out"));
  it("flowTypesFor: 設定があればそれ、無ければ全種類", () => {
    expect(flowTypesFor("ゆうちょ", DEFAULT_CONFIG)).toEqual(["預入", "入金", "引出", "出金"]);
    expect(flowTypesFor("未知の口座", DEFAULT_CONFIG)).toEqual(["預入", "入金", "引出", "出金", "投資振替"]);
  });
});

describe("migrateEntry", () => {
  it("新形式はそのまま(idを補完)", () => {
    const e = migrateEntry({ ym: "2026-06", cat: "card", item: "VIEW", amount: 100 })!;
    expect(e.cat).toBe("card");
    expect(e.id).toBeTruthy();
  });
  it("口座の「受取」は「入金」へ改称", () => {
    const e = migrateEntry({ ym: "2026-06", cat: "account", item: "受取", account: "ゆうちょ", amount: 500 })!;
    expect(e.item).toBe("入金");
    expect(e.amount).toBe(500);
  });
  it("口座の「送金」は「出金」へ改称", () => {
    const e = migrateEntry({ ym: "2026-06", cat: "account", item: "送金", account: "ゆうちょ", amount: -500 })!;
    expect(e.item).toBe("出金");
    expect(e.amount).toBe(-500);
  });
  it("給与系の臨時収入は口座の入金へ移す", () => {
    const e = migrateEntry({ ym: "2026-05", cat: "salary", item: "臨時収入", amount: -300 });
    expect(e).toMatchObject({ cat: "account", item: "入金", amount: 300 });
  });
  it("旧kind形式: deductionは控除(負値)へ", () => {
    const e = migrateEntry({ ym: "2026-05", kind: "deduction", amount: 500 });
    expect(e).toMatchObject({ cat: "salary", item: "控除", amount: -500 });
  });
  it("旧kind形式: transferは符号で入金/引出に振り分け", () => {
    expect(migrateEntry({ ym: "2026-05", kind: "transfer", amount: 100 })!.item).toBe("入金");
    expect(migrateEntry({ ym: "2026-05", kind: "transfer", amount: -100 })!.item).toBe("引出");
  });
  it("壊れたデータはnull(落とさない)", () => {
    expect(migrateEntry(null)).toBeNull();
    expect(migrateEntry({ ym: "2026-05", kind: "謎" })).toBeNull();
  });
});

describe("migrateConfig", () => {
  it("accountFlowsの「受取」を「入金」、「送金」を「出金」へ", () => {
    const c = migrateConfig({ accountFlows: { "ゆうちょ": ["預入", "受取"], "JRE BANK": ["受取", "送金"] } });
    expect(c.accountFlows["ゆうちょ"]).toEqual(["預入", "入金"]);
    expect(c.accountFlows["JRE BANK"]).toEqual(["入金", "出金"]);
  });
  it("accountFlowsが無ければaccountFlowsはそのまま", () => {
    const c = { accounts: ["A"] };
    expect(migrateConfig(c).accountFlows).toBeUndefined();
  });
  it("memoCategoriesが無ければ既定値(交際費)を補う", () => {
    expect(migrateConfig({ accounts: ["A"] }).memoCategories).toEqual(["交際費"]);
  });
  it("memoCategoriesが既にあればそのまま", () => {
    expect(migrateConfig({ accounts: ["A"], memoCategories: ["娯楽費"] }).memoCategories).toEqual(["娯楽費"]);
  });
});

describe("computeSummary", () => {
  const entries: Entry[] = [
    { ym: "2026-06", cat: "salary", item: "給与", amount: 300000 },
    { ym: "2026-06", cat: "salary", item: "控除", amount: -50000 },
    { ym: "2026-06", cat: "card", item: "VIEW", amount: 40000 },
    { ym: "2026-06", cat: "account", item: "入金", account: "A", amount: 10000 },
    { ym: "2026-06", cat: "account", item: "引出", account: "A", amount: -20000 },
    { ym: "2026-06", cat: "account", item: "投資振替", account: "B", amount: -30000 },
    { ym: "2026-06", cat: "account", item: "残高", account: "A", amount: 111111 },
    { ym: "2026-06", cat: "account", item: "残高", account: "B", amount: 222222 },
  ];
  const s = computeSummary(entries);
  it("収入=給与+控除+入金系", () => expect(s.income).toBe(300000 - 50000 + 10000));
  it("支出=カード+出金系", () => expect(s.expense).toBe(40000 + 20000));
  it("収支=収入-支出+投資振替(符号のまま)", () => expect(s.net).toBe(s.income - s.expense - 30000));
  it("残高計", () => expect(s.balTotal).toBe(333333));
});

describe("計画", () => {
  it("planMonths: 4月始まり12か月・年またぎ", () => {
    const ms = planMonths(2026);
    expect(ms).toHaveLength(12);
    expect(ms[0]).toBe("2026-04");
    expect(ms[11]).toBe("2027-03");
  });
  it("fyStartOf: 3月は前年度・4月は当年度", () => {
    expect(fyStartOf("2026-03")).toBe(2025);
    expect(fyStartOf("2026-04")).toBe(2026);
  });
  it("planValue: 標準月と例外上書き", () => {
    const plan = { lines: { "salary|給与": { std: 310000, over: { "2026-06": 286000 } } } };
    expect(planValue(plan, "salary|給与", "2026-05")).toBe(310000);
    expect(planValue(plan, "salary|給与", "2026-06")).toBe(286000);
    expect(planValue(plan, "無い行", "2026-06")).toBe(0);
  });
  it("planLines: 実績と同じグループ構成(口座に入金を含む)", () => {
    const lines = planLines(DEFAULT_CONFIG, [{ id: "c1", name: "VIEW" }]);
    const acct = lines.filter((l) => l.group === "account").map((l) => l.label);
    expect(acct).toEqual(["預入", "入金", "引出", "出金", "投資振替"]);
    expect(lines.some((l) => l.key === "card|VIEW" && l.group === "card")).toBe(true);
    expect(planGroupSign("card")).toBe(-1);
    expect(planGroupSign("salary")).toBe(1);
    expect(planGroupSign("account")).toBe(1);
  });
  it("planLines: memoCategoriesを設定すれば交際費以外のカテゴリも計画対象になる", () => {
    const config: Config = { accounts: [], salaryItems: [], memoCategories: ["交際費", "娯楽費"] };
    const lines = planLines(config, []);
    const other = lines.filter((l) => l.group === "other").map((l) => l.key);
    expect(other).toEqual(["memo|交際費", "memo|娯楽費"]);
  });
  it("planLines: memoCategories未設定なら交際費のみ(後方互換)", () => {
    const config: Config = { accounts: [], salaryItems: [] };
    const lines = planLines(config, []);
    expect(lines.filter((l) => l.group === "other").map((l) => l.key)).toEqual(["memo|交際費"]);
  });

  const month: Entry[] = [
    { ym: "2026-06", cat: "salary", item: "給与", amount: 286720 },
    { ym: "2026-06", cat: "card", item: "VIEW", amount: 40000 },
    { ym: "2026-06", cat: "account", item: "投資振替", account: "B", amount: -94000 },
    { ym: "2026-06", cat: "account", item: "残高", account: "A", amount: 155596 },
  ];
  const memos: Memo[] = [
    { id: "m1", title: "飲み会", category: "交際費", ym: "2026-06", amount: 12000 },
    { id: "m2", title: "誕生日", category: "交際費", ym: "2026-05", amount: 9999 },
  ];
  it("actualForLine: 給与/カード/口座フロー(符号付き)/交際費メモ(月別)", () => {
    expect(actualForLine("salary|給与", month, memos, "2026-06")).toBe(286720);
    expect(actualForLine("card|VIEW", month, memos, "2026-06")).toBe(40000);
    expect(actualForLine("flow|投資振替", month, memos, "2026-06")).toBe(-94000);
    expect(actualForLine("memo|交際費", month, memos, "2026-06")).toBe(12000);
  });
  it("hasActualForLine: 記録の有無で見通しの実績/計画を判定", () => {
    expect(hasActualForLine("salary|給与", month, memos, "2026-06")).toBe(true);
    expect(hasActualForLine("flow|引出", month, memos, "2026-06")).toBe(false);
    expect(hasActualForLine("memo|交際費", [], memos, "2026-04")).toBe(false);
  });
  it("monthHasInput: 記録またはその月のメモがあればtrue(入力済み月の空欄に計画値を出さない判定)", () => {
    expect(monthHasInput(month, [], "2026-06")).toBe(true);       // 記録あり
    expect(monthHasInput([], memos, "2026-06")).toBe(true);       // その月のメモあり
    expect(monthHasInput([], memos, "2026-04")).toBe(false);      // 記録もその月のメモもなし
    expect(monthHasInput([], [], "2026-06")).toBe(false);         // 完全に未入力
  });
  it("残高記録の検出と合計", () => {
    expect(hasBalRecord(month)).toBe(true);
    expect(balTotalOf(month)).toBe(155596);
    expect(hasBalRecord([])).toBe(false);
  });

  it("planVsActualForMonth: 収入/支出/収支の計画・実績・差を算出(簡素化モデル)", () => {
    // 固定費=定期費(subs)の月換算合計。変動費30万+固定費 が支出見込み。
    const subs: Sub[] = [{ id: "s1", name: "Netflix", amount: 1000, cycle: "monthly" }];
    const plans: Plan = { lines: { income: { std: 300000, over: {} }, variable: { std: 100000, over: {} }, invest: { std: 0, over: {} } } };
    const monthEntries: Entry[] = [
      { ym: "2026-06", cat: "salary", item: "給与", amount: 310000 },
      { ym: "2026-06", cat: "card", item: "VIEW", amount: 120000 },
    ];
    const r = planVsActualForMonth(plans, subs, monthEntries, "2026-06");
    expect(r.planIncome).toBe(300000);
    expect(r.planSpending).toBe(100000 + 1000);        // 変動費 + 固定費
    expect(r.planNet).toBe(300000 - 101000);
    expect(r.actualIncome).toBe(310000);
    expect(r.actualSpending).toBe(120000);
    expect(r.actualNet).toBe(310000 - 120000);
    expect(r.diff).toBe(r.actualNet - r.planNet);
  });

  it("fixedMonthly/plannedSpending: 年払いは1/12で月換算し固定費に足す", () => {
    const subs: Sub[] = [
      { id: "s1", name: "月額", amount: 1000, cycle: "monthly" },
      { id: "s2", name: "年払い", amount: 12000, cycle: "yearly" },
    ];
    expect(fixedMonthly(subs)).toBe(1000 + 1000);
    const plans: Plan = { lines: { variable: { std: 50000, over: { "2026-06": 60000 } } } };
    expect(plannedSpending(plans, subs, "2026-05")).toBe(2000 + 50000);
    expect(plannedSpending(plans, subs, "2026-06")).toBe(2000 + 60000);
  });

  it("migratePlan: 旧形式(カード別・フロー別)を 収入/変動費/投資 の総額へ移行(総額を保つ)", () => {
    const subs: Sub[] = [{ id: "s1", name: "sub", amount: 2000, cycle: "monthly" }];
    const legacy: any = {
      fyStart: 2026,
      lines: {
        "salary|給与": { std: 300000, over: { "2026-06": 286000 } },
        "salary|控除": { std: -60000, over: {} },
        "flow|入金": { std: 0, over: { "2026-11": 100000 } },
        "flow|投資振替": { std: -46000, over: {} },
        "card|VIEW": { std: 60000, over: {} },
        "card|SAISON": { std: 40000, over: {} },
        "memo|交際費": { std: 25000, over: {} },   // 引き継がれない
      },
    };
    const p = migratePlan(legacy, subs);
    expect(Object.keys(p.lines).sort()).toEqual(["income", "invest", "variable"]);
    expect(p.lines.income.std).toBe(300000 - 60000);
    expect(p.lines.income.over["2026-06"]).toBe(286000 - 60000);
    expect(p.lines.income.over["2026-11"]).toBe(300000 - 60000 + 100000);
    // 変動費 = (カード計 100000) − 固定費(2000)。総額=固定費+変動費=カード計 を保つ
    expect(p.lines.variable.std).toBe(100000 - 2000);
    expect(plannedSpending(p, subs, "2026-05")).toBe(100000);
    expect(p.lines.invest.std).toBe(-46000);
    // 既に新形式なら素通し
    expect(migratePlan(p, subs)).toBe(p);
  });
});

describe("cardBreakdown", () => {
  const cards: Card[] = [{ id: "c1", name: "楽天カード" }, { id: "c2", name: "VIEW" }];
  const monthEntries: Entry[] = [
    { ym: "2026-06", cat: "card", item: "楽天カード", amount: 30000 },
    { ym: "2026-06", cat: "card", item: "VIEW", amount: 5000 },
  ];
  it("残債とそれ以外に分割し、残債は請求額を超えない", () => {
    const debt = { "楽天カード": { "2026-06": 8000 } };
    const rows = cardBreakdown(cards, debt, [], monthEntries, "2026-06");
    const rakuten = rows.find((r) => r.name === "楽天カード")!;
    expect(rakuten.total).toBe(30000);
    expect(rakuten.debtPortion).toBe(8000);
    expect(rakuten.otherPortion).toBe(22000);
  });
  it("残債データが請求額を超えていてもotherPortionは負にならない", () => {
    const debt = { "VIEW": { "2026-06": 9000 } };
    const rows = cardBreakdown(cards, debt, [], monthEntries, "2026-06");
    const view = rows.find((r) => r.name === "VIEW")!;
    expect(view.total).toBe(5000);
    expect(view.debtPortion).toBe(5000);
    expect(view.otherPortion).toBe(0);
  });
  it("紐づくメモを月一致でフィルタして含める(収支には影響しない参考情報)", () => {
    const memos: Memo[] = [
      { id: "m1", title: "Netflix", linkedCard: "楽天カード", ym: "2026-06", amount: 1500 },
      { id: "m2", title: "先月分", linkedCard: "楽天カード", ym: "2026-05", amount: 1000 },
      { id: "m3", title: "無関係", linkedCard: "VIEW", ym: "2026-06", amount: 500 },
    ];
    const rows = cardBreakdown(cards, {}, memos, monthEntries, "2026-06");
    const rakuten = rows.find((r) => r.name === "楽天カード")!;
    expect(rakuten.linkedMemos.map((m) => m.id)).toEqual(["m1"]);
  });
  it("請求も紐づくメモも無いカードは除外する", () => {
    const cardsWithExtra: Card[] = [...cards, { id: "c3", name: "使っていないカード" }];
    const rows = cardBreakdown(cardsWithExtra, {}, [], monthEntries, "2026-06");
    expect(rows.some((r) => r.name === "使っていないカード")).toBe(false);
  });
});

describe("サブスク更新日の自動繰り越し", () => {
  it("advanceRenewalDate: 月額は+1か月", () => {
    expect(advanceRenewalDate("2026-06-15", "monthly")).toBe("2026-07-15");
    expect(advanceRenewalDate("2026-12-15", "monthly")).toBe("2027-01-15");
  });
  it("advanceRenewalDate: 年払いは+1年", () => {
    expect(advanceRenewalDate("2026-11-01", "yearly")).toBe("2027-11-01");
  });
  it("advanceRenewalDate: 月末日は月をまたいでクランプ(JSのDateの仕様どおり)", () => {
    // 1/31 の翌月 -> 2月は28/29日までなので3/2,3/3等にずれる(意図された仕様の確認)
    expect(advanceRenewalDate("2026-01-31", "monthly")).toBe("2026-03-03");
  });

  it("rollForwardSubs: 過ぎた更新日を今日以降まで繰り越す", () => {
    const subs: Sub[] = [{ id: "1", name: "テスト", amount: 1000, renewal: "2026-01-15", cycle: "monthly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r[0]!.renewal! >= "2026-06-10").toBe(true);
    // 月額なので15日を維持したまま繰り越されるはず
    expect(r[0]!.renewal).toBe("2026-06-15");
  });
  it("rollForwardSubs: 今日以降ならそのまま(参照も同じ)", () => {
    const subs: Sub[] = [{ id: "1", name: "テスト", amount: 1000, renewal: "2026-12-01", cycle: "monthly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r).toBe(subs);
  });
  it("rollForwardSubs: 更新日なしのサブスクは無視", () => {
    const subs: Sub[] = [{ id: "1", name: "テスト", amount: 1000, renewal: "", cycle: "monthly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r).toBe(subs);
  });
  it("rollForwardSubs: 年払いも正しく繰り越す", () => {
    const subs: Sub[] = [{ id: "1", name: "テスト", amount: 1000, renewal: "2024-03-01", cycle: "yearly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r[0]!.renewal).toBe("2027-03-01");
  });
});

describe("月の締めフラグ", () => {
  it("isMonthClosed: 含まれる/含まれない/未定義", () => {
    expect(isMonthClosed(["2026-05", "2026-06"], "2026-06")).toBe(true);
    expect(isMonthClosed(["2026-05"], "2026-06")).toBe(false);
    expect(isMonthClosed(undefined, "2026-06")).toBe(false);
  });
  it("toggleMonthClosed: 無ければ追加、あれば削除(ソート済みで返す)", () => {
    expect(toggleMonthClosed([], "2026-06")).toEqual(["2026-06"]);
    expect(toggleMonthClosed(["2026-06"], "2026-06")).toEqual([]);
    expect(toggleMonthClosed(["2026-07"], "2026-06")).toEqual(["2026-06", "2026-07"]);
  });
});

describe("スクショ取込(OCR明細インポート)", () => {
  // ゆうちょ通帳アプリの明細画面をOCRしたテキストを想定(実際のスクリーンショットから再現)
  const bankText = `
2026.07.10
自払　ミツビシUFJニコス
-¥548
¥2,856
2026.07.10
自払　JCBカード
-¥93,846
¥3,404
2026.07.08
ことら　ハヤシ　シユンヤ
¥95,000
¥97,250
2026.07.06
自払　セゾン
-¥3,600
¥2,250
`;

  it("parseBankText: 日付→摘要→取引額→残高(無視)の並びを取引ごとに分解する", () => {
    const txns = parseBankText(bankText);
    expect(txns).toHaveLength(4);
    expect(txns[0]).toEqual({ date: "2026-07-10", desc: "自払　ミツビシUFJニコス", amount: -548 });
    expect(txns[1]).toEqual({ date: "2026-07-10", desc: "自払　JCBカード", amount: -93846 });
    expect(txns[2]).toEqual({ date: "2026-07-08", desc: "ことら　ハヤシ　シユンヤ", amount: 95000 });
    expect(txns[3]).toEqual({ date: "2026-07-06", desc: "自払　セゾン", amount: -3600 });
  });
  it("parseBankText: 摘要が複数行に折り返されても連結する", () => {
    const t = `2026.07.10\n自払　ミツビ゛シUFJニコ\nス\n-¥548\n¥2,856`;
    const txns = parseBankText(t);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.desc).toBe("自払　ミツビ゛シUFJニコス");
  });
  it("parseBankText: 空文字・ヘッダー行(日付でも金額でもない行)は無視する", () => {
    const t = `9:18\n明細\nすべて\n2026.07.10\n自払　セゾン\n-¥3,600\n¥2,250`;
    expect(parseBankText(t)).toHaveLength(1);
  });

  it("classifyTxn: キーワードにマッチしたルールを適用(登録順で先勝ち)", () => {
    const rules: ImportRule[] = [
      { id: "1", match: "ミツビシ", action: "card", target: "MDC" },
      { id: "2", match: "JCBカード", action: "card", target: "JAL navi" },
      { id: "3", match: "セゾン", action: "card", target: "SAISON" },
      { id: "4", match: "ことら", action: "skip" },
    ];
    expect(classifyTxn("自払　ミツビシUFJニコス", rules)).toEqual({ action: "card", target: "MDC" });
    expect(classifyTxn("自払　JCBカード", rules)).toEqual({ action: "card", target: "JAL navi" });
    expect(classifyTxn("ことら　ハヤシ　シユンヤ", rules)).toEqual({ action: "skip", target: undefined });
  });
  it("classifyTxn: マッチしなければnull(要手動判定)", () => {
    expect(classifyTxn("謎の取引", [{ id: "1", match: "ミツビシ", action: "card", target: "MDC" }])).toBeNull();
  });
  it("classifyTxn: 全角/半角・空白ゆれを吸収する(NFKC正規化)", () => {
    const rules: ImportRule[] = [{ id: "1", match: "ＪＣＢ カード", action: "card", target: "JAL navi" }];
    expect(classifyTxn("自払 JCBカード", rules)).toEqual({ action: "card", target: "JAL navi" });
  });

  it("txnToEntry: cardアクションはカード請求のentryへ(金額は絶対値)", () => {
    const e = txnToEntry({ date: "2026-07-10", desc: "自払　ミツビシ", amount: -548 }, { action: "card", target: "MDC" });
    expect(e).toEqual({ ym: "2026-07", cat: "card", item: "MDC", account: "", amount: 548 });
  });
  it("txnToEntry: accountアクションは符号で出金/入金を判定", () => {
    const out = txnToEntry({ date: "2026-07-06", desc: "x", amount: -3600 }, { action: "account", target: "ゆうちょ" });
    expect(out).toEqual({ ym: "2026-07", cat: "account", item: "出金", account: "ゆうちょ", amount: -3600 });
    const inn = txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, { action: "account", target: "ゆうちょ" });
    expect(inn).toEqual({ ym: "2026-07", cat: "account", item: "入金", account: "ゆうちょ", amount: 95000 });
  });
  it("txnToEntry: skip・未分類(null)・対象未選択はnull", () => {
    expect(txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, { action: "skip" })).toBeNull();
    expect(txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, null)).toBeNull();
    expect(txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, { action: "card" })).toBeNull();
  });

  it("エンドツーエンド: 実際のスクショ相当のテキストが正しい件数のentryになる", () => {
    const txns = parseBankText(bankText);
    const entries = txns.map((t) => txnToEntry(t, classifyTxn(t.desc, DEFAULT_CONFIG.importRules))).filter(Boolean);
    // ミツビシ/JCBカード/セゾンの3件はentry化、ことらの1件はskipで除外
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e!.item)).toEqual(["MDC", "JAL navi", "SAISON"]);
  });

  // 実際にユーザーから報告された生のOCR出力をそのまま再現(濁点の脱落・¥の誤読(\/Y)・
  // -の誤読(_)・桁区切りの,と.の混在・摘要と金額が同じ行に入る、というOCR特有のノイズを含む)
  const realOcrText = [
    "9:18 員 HH 半生 ら 送 25",
    "く _ 前 の 月 品 2026 年 7 月 <",
    "すべ て <・ 。 新着 順 ~ 残高 門 )",
    "2026.07.10",
    "自 払 ミツ ヒ * シ UF J ニ コ _Y 548",
    "ス \\ 2.,856",
    "2026.07.10",
    "自 払 JCB カー ト * -\\ 93.846",
    "\\ 3.404",
    "2026.07.08",
    "こと ら ハヤ シ シュ ユ ュ ン ヤ \\ 95,000",
    "\\ 97.250",
    "2026.07.06",
    "自 払 セ ソ ` ン -\\ 3.600",
    "\\ 2.250",
    "2026.07.06",
    "自 払 セ ソ * ン -\\ 10.000",
    "\\ 5,850",
    "2026.07.06",
    "自 払 セ ソ ` ン -\\ フ 746",
    "\\ 15,850",
    "人 和仁 _ 丘 ご ピピ に 三",
    "ホー ム 明細 送金 支払 グラ フ メニ ュー",
  ].join("\n");

  it("parseBankText: 実際のOCRノイズ(濁点脱落・¥の誤読・行内に金額が入る)を含む生テキストからも取引を検出する", () => {
    const txns = parseBankText(realOcrText);
    expect(txns.length).toBeGreaterThanOrEqual(5);
    expect(txns[0]).toEqual({ date: "2026-07-10", desc: "自 払 ミツ ヒ * シ UF J ニ コス", amount: -548 });
    expect(txns[1]).toEqual({ date: "2026-07-10", desc: "自 払 JCB カー ト *", amount: -93846 });
    expect(txns[2]).toEqual({ date: "2026-07-08", desc: "こと ら ハヤ シ シュ ユ ュ ン ヤ", amount: 95000 });
    expect(txns[3]).toEqual({ date: "2026-07-06", desc: "自 払 セ ソ ` ン", amount: -3600 });
    expect(txns[4]).toEqual({ date: "2026-07-06", desc: "自 払 セ ソ * ン", amount: -10000 });
  });

  it("parseBankText: 金額を検出した後にフッターのナビ文字等が続いても摘要に巻き込まない", () => {
    // 最後の取引(数字がカナに誤読され金額行を検出できなかったケース)の直後に、
    // アプリ下部のナビゲーション文字(フッター)が続く実際のケースを再現
    const txns = parseBankText(realOcrText);
    const last = txns[txns.length - 1]!;
    expect(last.desc).not.toContain("ホーム");
    expect(last.desc).not.toContain("メニュー");
    expect(last.desc).not.toContain("和仁");
  });

  it("normalizeForMatch: 濁点の脱落・OCRノイズ記号・空白を吸収する", () => {
    expect(normalizeForMatch("ミツ ヒ * シ")).toBe(normalizeForMatch("ミツビシ"));
    expect(normalizeForMatch("セ ソ ` ン")).toBe(normalizeForMatch("セゾン"));
    expect(normalizeForMatch("カー ト *")).toBe(normalizeForMatch("カード"));
  });

  it("classifyTxn: 濁点が脱落した実際のOCR結果でもキーワードにマッチする", () => {
    const rules = DEFAULT_CONFIG.importRules;
    expect(classifyTxn("自 払 ミツ ヒ * シ UF J ニ コス", rules)).toEqual({ action: "card", target: "MDC" });
    expect(classifyTxn("自 払 JCB カー ト *", rules)).toEqual({ action: "card", target: "JAL navi" });
    expect(classifyTxn("自 払 セ ソ ` ン", rules)).toEqual({ action: "card", target: "SAISON" });
    expect(classifyTxn("こと ら ハヤ シ シュ ユ ュ ン ヤ", rules)).toEqual({ action: "skip", target: undefined });
  });

  it("エンドツーエンド: 実際のOCRノイズを含むテキストでもMDC/JAL navi/SAISON/ことらが正しく自動仕分けされる", () => {
    const txns = parseBankText(realOcrText);
    const classified = txns.map((t) => classifyTxn(t.desc, DEFAULT_CONFIG.importRules));
    const cardTargets = classified.filter((c) => c && c.action === "card").map((c) => c!.target);
    expect(cardTargets).toEqual(expect.arrayContaining(["MDC", "JAL navi", "SAISON"]));
    expect(classified.some((c) => c && c.action === "skip")).toBe(true);
  });

  // NEOBANK形式: 取引ごとの日付行が無く、"N日"の見出し1つに複数の取引がぶら下がる。
  // 金額は"¥"ではなく"円"表記。月の表記も無いため、表示中の月(contextYm)を起点に判定する。
  const neobankText = [
    "10日",
    "ＳＢＩハイブリッド預... +10,000円",
    "残高14,660円",
    "ATM　セブン銀行 -17,000円",
    "残高4,660円",
    "ATM　ゆうちょ銀行 +17,000円",
    "残高21,660円",
    "8日",
    "ことら送金　ハヤシ　... -95,000円",
    "残高20,660円",
    "ＳＢＩハイブリッド預... +110,000円",
    "残高115,660円",
    "30日",
    "ＳＢＩハイブリッド預... -4,000円",
    "残高5,660円",
    "29日",
    "口座振替　エポスカー... -15,322円",
    "残高9,660円",
    "口座振替　ＰａｙＰａ... -5,314円",
    "残高24,982円",
  ].join("\n");

  it("parseBankText: 'N日'見出し形式(NEOBANK等)を日ごとにグループ化し、年月はcontextYmを使う", () => {
    const txns = parseBankText(neobankText, "2026-08");
    expect(txns[0]).toEqual({ date: "2026-08-10", desc: "ＳＢＩハイブリッド預...", amount: 10000 });
    expect(txns[1]).toEqual({ date: "2026-08-10", desc: "ATM　セブン銀行", amount: -17000 });
    expect(txns[3]).toEqual({ date: "2026-08-08", desc: "ことら送金　ハヤシ　...", amount: -95000 });
  });

  it("parseBankText: 日が前より大きくなったら前月へ遡ったとみなす(新しい順の一覧を過去へ辿る想定)", () => {
    const txns = parseBankText(neobankText, "2026-08");
    // 8日→30日で前月(7月)に切り替わる(日が前より大きくなった=遡って前月に入った)
    const afterRollover = txns.find((t) => t.desc.includes("エポス"));
    expect(afterRollover!.date).toBe("2026-07-29");
  });

  it("classifyTxn/txnToEntry: ハイブリッド預金は投資振替、ATMは引出/預入として口座記録になる", () => {
    const rules = DEFAULT_CONFIG.importRules;
    const hybridIn = classifyTxn("ＳＢＩハイブリッド預...", rules);
    expect(hybridIn).toMatchObject({ action: "account", target: "NEOBANK", negItem: "投資振替", posItem: "投資振替" });
    expect(txnToEntry({ date: "2026-08-10", desc: "x", amount: 10000 }, hybridIn)).toEqual({ ym: "2026-08", cat: "account", item: "投資振替", account: "NEOBANK", amount: 10000 });
    expect(txnToEntry({ date: "2026-07-30", desc: "x", amount: -4000 }, hybridIn)).toEqual({ ym: "2026-07", cat: "account", item: "投資振替", account: "NEOBANK", amount: -4000 });

    const atm = classifyTxn("ATM　セブン銀行", rules);
    expect(txnToEntry({ date: "2026-08-10", desc: "x", amount: -17000 }, atm)).toEqual({ ym: "2026-08", cat: "account", item: "引出", account: "NEOBANK", amount: -17000 });
    expect(txnToEntry({ date: "2026-08-10", desc: "x", amount: 17000 }, atm)).toEqual({ ym: "2026-08", cat: "account", item: "預入", account: "NEOBANK", amount: 17000 });
  });

  it("classifyTxn: エポス/PayPayの口座振替はカード請求として仕分けられる(末尾が切れていても)", () => {
    const rules = DEFAULT_CONFIG.importRules;
    expect(classifyTxn("口座振替　エポスカー...", rules)).toEqual({ action: "card", target: "EPOS", negItem: undefined, posItem: undefined });
    expect(classifyTxn("口座振替　ＰａｙＰａ...", rules)).toEqual({ action: "card", target: "PayPay", negItem: undefined, posItem: undefined });
  });

  // 実機で実際に報告された生のOCR出力(NEOBANK)をそのまま再現。
  // "N 日"のように日見出しに空白が入る/"円"が全く別の漢字(哲・折・四)に誤読される、という
  // 新たなOCRノイズを含む
  const neobankRealOcrText = [
    "15:08 員 記念 経",
    "X の )",
    "30 日",
    "( 紀 ) SB 1 ハイブ リッ ド 碧 ..…. -4.000 哲",
    "残高 5.660 円",
    "29 日",
    "口座 振替 エポス カー... -15,322 哲",
    "ーー 残高 9,660 円",
    "口座 振替 PayPa... -5.314 哲",
    "ーー 残高 24,982 円",
    "26 日",
    "( 紀 ) SB 1 ハイブ リッ ド 碧 ..…. -40.000 哲",
    "残高 30,296 円",
    "(上 こと ら 送 金 ハヤ シ .. +40.000 四",
    "残高 70,296 円",
    "25 日",
    "の ② ATM ゆう ちょ 銀行 -25,000 哲",
    "残高 30,296 円",
    "24 日",
    "( 紀 ) SB 1 ハイブ リッ ド 碧 ..…. -50,000 折",
    "残高 55,296 円",
    "(上 こと ら 送 金 ハヤ シ .. +100.000 哲",
    "残高 105,296 円",
    "く 〇",
  ].join("\n");

  it("parseBankText: 日見出しの空白・'円'の誤読(哲/折/四)を含む実機OCRでも取引を検出する", () => {
    const txns = parseBankText(neobankRealOcrText, "2026-06");
    expect(txns.length).toBeGreaterThanOrEqual(7);
    expect(txns[0]!.amount).toBe(-4000);
    expect(txns[0]!.date).toBe("2026-06-30"); // 最初の日見出しはcontextYmをそのまま使う
    // 26日→25日→24日と減っていく中で問題なく同じ月に留まること
    const atmTxn = txns.find((t) => t.desc.includes("ATM"));
    expect(atmTxn!.date).toBe("2026-06-25");
  });

  it("エンドツーエンド: 実機OCR(NEOBANK)でもSBIハイブリッド/ATM/エポス/PayPay/ことらが正しく仕分けられる", () => {
    const txns = parseBankText(neobankRealOcrText, "2026-06");
    const classified = txns.map((t) => classifyTxn(t.desc, DEFAULT_CONFIG.importRules));
    expect(classified.filter((c) => c && c.negItem === "投資振替").length).toBeGreaterThanOrEqual(2); // SBIハイブリッド
    expect(classified.some((c) => c && c.negItem === "引出")).toBe(true); // ATM
    expect(classified.some((c) => c && c.action === "card" && c.target === "EPOS")).toBe(true);
    expect(classified.some((c) => c && c.action === "card" && c.target === "PayPay")).toBe(true);
    expect(classified.some((c) => c && c.action === "skip")).toBe(true); // ことら
  });
});
