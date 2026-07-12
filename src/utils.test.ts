import { describe, it, expect } from "vitest";
import {
  yen, num, addMonth, ymLabel,
  migrateEntry, migrateConfig, acctRole, flowTypesFor, computeSummary,
  planMonths, fyStartOf, planValue, actualForLine, hasActualForLine,
  hasBalRecord, balTotalOf, planLines, planGroupSign, DEFAULT_CONFIG,
  planVsActualForMonth, advanceRenewalDate, rollForwardSubs,
  isMonthClosed, toggleMonthClosed, cardBreakdown, monthHasInput,
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

  it("planVsActualForMonth: 実績合計/計画合計/差を算出", () => {
    const cards: Card[] = [{ id: "c1", name: "VIEW" }];
    const config: Config = { accounts: [], salaryItems: ["給与"] };
    const plans: Plan = { lines: { "salary|給与": { std: 300000, over: {} }, "card|VIEW": { std: 40000, over: {} } } };
    const monthEntries: Entry[] = [
      { ym: "2026-06", cat: "salary", item: "給与", amount: 310000 },
      { ym: "2026-06", cat: "card", item: "VIEW", amount: 35000 },
    ];
    const r = planVsActualForMonth(plans, config, cards, [], monthEntries, "2026-06");
    expect(r.planNet).toBe(300000 - 40000);
    expect(r.actualNet).toBe(310000 - 35000);
    expect(r.diff).toBe(r.actualNet - r.planNet);
  });

  it("planVsActualForMonth: 交際費(その他)は計画/実績があっても収支計には含まない", () => {
    const cards: Card[] = [{ id: "c1", name: "VIEW" }];
    const config: Config = { accounts: [], salaryItems: ["給与"] };
    const plans: Plan = {
      lines: {
        "salary|給与": { std: 300000, over: {} },
        "card|VIEW": { std: 40000, over: {} },
        "memo|交際費": { std: 25000, over: {} },
      },
    };
    const monthEntries: Entry[] = [
      { ym: "2026-06", cat: "salary", item: "給与", amount: 310000 },
      { ym: "2026-06", cat: "card", item: "VIEW", amount: 35000 },
    ];
    const memosWithEntertainment: Memo[] = [{ id: "m1", title: "飲み会", category: "交際費", ym: "2026-06", amount: 12000 }];
    const r = planVsActualForMonth(plans, config, cards, memosWithEntertainment, monthEntries, "2026-06");
    // 交際費の計画(25000)・実績(12000)が入っていても、収支計は給与とカードのみで決まる
    expect(r.planNet).toBe(300000 - 40000);
    expect(r.actualNet).toBe(310000 - 35000);
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
});
