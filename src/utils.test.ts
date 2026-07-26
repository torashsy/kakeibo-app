import { describe, it, expect } from "vitest";
import {
  yen, num, addMonth, ymLabel, cycleYm, cycleStartDate, periodLabel, periodRange, isBankHoliday,
  migrateEntry, migrateConfig, acctRole, flowTypesFor, computeSummary,
  planMonths, fyStartOf, planValue,
  hasBalRecord, balTotalOf, DEFAULT_CONFIG, INTERNAL_TRANSFER_ITEM,
  planVsActualForMonth, advanceRenewalDate, rollForwardSubs,
  migratePlan, fixedMonthly, plannedSpending, plannedVariable, variableBuckets, annualOutlook,
  isMonthClosed, toggleMonthClosed, cardBreakdown, monthHasInput, debtValueTotal,
  parseBankText, classifyTxn, classifyTxnForImport, txnToEntry, normalizeForMatch, verifyOcrBalanceChain, evalAmount,
  parseCsvRows, normalizeCsvDate, parseCsvAmount, parseBankCsv, txnKey, dedupeTxns, guessYuchoScreenshotAccount, matchesOwnName, pairOwnTransfers, findInternalTransfers, verifyBalanceTotal, isCardStatement, fixSignsFromBalances, cycleEndBalances, findCardByTotal, cardMonthTotal, DEBIT_HINT_RE, isDebitDesc, cleanOcrText, guessCardForDebit, payeeFromDebit, balancesAsOf, balTotalAsOf, verifyCycles, cycleEndDate, decodeImportPayload, fuzzyIncludes, repairAmountsFromBalances, entrySignature, countBySignature, balanceReachesCycleEnd, shouldReplaceBalance, explainCycleGap, cycleGapDirection, findDuplicateEntries, entryDaySignature, entryDate,
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
    expect(acctRole(INTERNAL_TRANSFER_ITEM)).toBe("neutral");
  });
  it("旧称「受取」も収入として後方互換", () => expect(acctRole("受取")).toBe("in"));
  it("旧称「送金」も支出として後方互換", () => expect(acctRole("送金")).toBe("out"));
  it("flowTypesFor: 設定があればそれ、無ければ全種類", () => {
    expect(flowTypesFor("ゆうちょ", DEFAULT_CONFIG)).toEqual(["預入", "入金", "引出", "出金", INTERNAL_TRANSFER_ITEM]);
    expect(flowTypesFor("未知の口座", DEFAULT_CONFIG)).toEqual(["預入", "入金", "引出", "出金", "投資振替", INTERNAL_TRANSFER_ITEM]);
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
  it("自分名義キーワードを一度だけ補い、削除後は復活させない", () => {
    const added = migrateConfig({ accounts: ["A"], ownTransferKeywords: [] });
    expect(added.ownTransferKeywords).toContain("ハヤシシュンヤ");
    expect(added.ownTransferKeywordsSeeded).toBe(1);
    expect(migrateConfig({ ...added, ownTransferKeywords: [] }).ownTransferKeywords).toEqual([]);
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
    { ym: "2026-06", cat: "account", item: INTERNAL_TRANSFER_ITEM, account: "A", amount: -7500 },
    { ym: "2026-06", cat: "account", item: INTERNAL_TRANSFER_ITEM, account: "B", amount: 7500 },
    { ym: "2026-06", cat: "account", item: "残高", account: "A", amount: 111111 },
    { ym: "2026-06", cat: "account", item: "残高", account: "B", amount: 222222 },
  ];
  const s = computeSummary(entries);
  it("収入=給与+控除+入金系", () => expect(s.income).toBe(300000 - 50000 + 10000));
  it("支出=カード+出金系", () => expect(s.expense).toBe(40000 + 20000));
  it("収支=収入-支出+投資振替(符号のまま)", () => expect(s.net).toBe(s.income - s.expense - 30000));
  it("残高計", () => expect(s.balTotal).toBe(333333));
  it("口座振替は収入・支出・収支に含めない", () => {
    expect(s.cashIn).toBe(10000);
    expect(s.cashOut).toBe(20000);
    expect(s.net).toBe(s.income - s.expense - 30000);
  });
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

  it("plannedVariable: 予算枠(var|)があれば合計、無ければ単一variable", () => {
    const single: Plan = { lines: { variable: { std: 100000, over: {} } } };
    expect(variableBuckets(single)).toEqual([]);
    expect(plannedVariable(single, "2026-06")).toBe(100000);
    const bucketed: Plan = { lines: { "var|旅費": { std: 30000, over: { "2026-06": 50000 } }, "var|交際費": { std: 20000, over: {} } } };
    expect(variableBuckets(bucketed).sort()).toEqual(["交際費", "旅費"]);
    expect(plannedVariable(bucketed, "2026-05")).toBe(30000 + 20000);
    expect(plannedVariable(bucketed, "2026-06")).toBe(50000 + 20000);
    // 支出見込み総額に枠合計が反映される
    expect(plannedSpending(bucketed, [], "2026-06")).toBe(70000);
  });

  it("annualOutlook: 実績月は実績・未入力月は計画で年度の収支/残高を試算", () => {
    const subs: Sub[] = [];
    const plan: Plan = { lines: { income: { std: 100000, over: {} }, variable: { std: 60000, over: {} }, invest: { std: 0, over: {} } } };
    const entries: Entry[] = [
      { ym: "2026-03", cat: "account", item: "残高", account: "A", amount: 50000 },  // 年度開始前月の残高
      { ym: "2026-04", cat: "salary", item: "給与", amount: 100000 },
      { ym: "2026-04", cat: "card", item: "X", amount: 70000 },
    ];
    const o = annualOutlook(plan, subs, entries, [], "2026-04");
    expect(o.fyStart).toBe(2026);
    expect(o.actualNet).toBe(30000);                       // 4月実績: 100000 − 70000
    expect(o.netForecast).toBe(30000 + 40000 * 11);        // 残り11か月は計画: 100000 − 60000
    expect(o.balStart).toBe(50000);
    expect(o.balEnd).toBe(50000 + 30000 + 40000 * 11);     // 残高記録が無いので収支を積み上げ
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
    expect(txns[0]).toEqual({ date: "2026-07-10", desc: "自払　ミツビシUFJニコス", amount: -548, balance: 2856 });
    expect(txns[1]).toEqual({ date: "2026-07-10", desc: "自払　JCBカード", amount: -93846, balance: 3404 });
    expect(txns[2]).toEqual({ date: "2026-07-08", desc: "ことら　ハヤシ　シユンヤ", amount: 95000, balance: 97250 });
    expect(txns[3]).toEqual({ date: "2026-07-06", desc: "自払　セゾン", amount: -3600, balance: 2250 });
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
      { id: "4", match: "ことら", action: "account", target: "NEOBANK", negItem: "出金", posItem: "入金" },
    ];
    expect(classifyTxn("自払　ミツビシUFJニコス", rules)).toEqual({ action: "card", target: "MDC" });
    expect(classifyTxn("自払　JCBカード", rules)).toEqual({ action: "card", target: "JAL navi" });
    // ことら送金そのものは他人との実際のやり取りなので口座の出金/入金にする
    expect(classifyTxn("ことら　タケナカ", rules)).toMatchObject({ action: "account", target: "NEOBANK" });
    // 自分名義かどうかは名前で判定できるが、振替かどうかは反対側の記録と組になって初めて決まる
    expect(matchesOwnName("ことら　ハヤシ　シユンヤ", ["ハヤシ シユンヤ"])).toBe(true);
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
    expect(e).toMatchObject({ ym: "2026-07", cat: "card", item: "MDC", account: "", amount: 548 });
  });
  it("txnToEntry: accountアクションは符号で出金/入金を判定", () => {
    const out = txnToEntry({ date: "2026-07-06", desc: "x", amount: -3600 }, { action: "account", target: "ゆうちょ" });
    expect(out).toMatchObject({ ym: "2026-07", cat: "account", item: "出金", account: "ゆうちょ", amount: -3600 });
    const inn = txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, { action: "account", target: "ゆうちょ" });
    expect(inn).toMatchObject({ ym: "2026-07", cat: "account", item: "入金", account: "ゆうちょ", amount: 95000 });
  });
  it("txnToEntry: skip・未分類(null)・対象未選択はnull", () => {
    expect(txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, { action: "skip" })).toBeNull();
    expect(txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, null)).toBeNull();
    expect(txnToEntry({ date: "2026-07-08", desc: "x", amount: 95000 }, { action: "card" })).toBeNull();
  });

  it("エンドツーエンド: 実際のスクショ相当のテキストが正しい件数のentryになる", () => {
    const txns = parseBankText(bankText);
    const entries = txns.map((t) => txnToEntry(t, classifyTxn(t.desc, DEFAULT_CONFIG.importRules))).filter(Boolean);
    // ミツビシ/JCBカード/セゾンの3件＋ことら(口座の出金/入金)の1件
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e!.item)).toEqual(["MDC", "JAL navi", "入金", "SAISON"]);
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
    expect(txns[0]).toMatchObject({ date: "2026-07-10", desc: "自 払 ミツ ヒ * シ UF J ニ コス", amount: -548, balance: 2856 });
    expect(txns[1]).toMatchObject({ date: "2026-07-10", desc: "自 払 JCB カー ト *", amount: -93846, balance: 3404 });
    expect(txns[2]).toMatchObject({ date: "2026-07-08", desc: "こと ら ハヤ シ シュ ユ ュ ン ヤ", amount: 95000, balance: 97250 });
    expect(txns[3]).toMatchObject({ date: "2026-07-06", desc: "自 払 セ ソ ` ン", amount: -3600, balance: 2250 });
    expect(txns[4]).toMatchObject({ date: "2026-07-06", desc: "自 払 セ ソ * ン", amount: -10000, balance: 5850 });
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
    // ことら送金は口座の出金/入金になる
    expect(classifyTxn("こと ら ハヤ シ シュ ユ ュ ン ヤ", rules)).toMatchObject({ action: "account", target: "NEOBANK" });
  });

  it("エンドツーエンド: 実際のOCRノイズを含むテキストでもMDC/JAL navi/SAISON/ことらが正しく自動仕分けされる", () => {
    const txns = parseBankText(realOcrText);
    const classified = txns.map((t) => classifyTxn(t.desc, DEFAULT_CONFIG.importRules));
    const cardTargets = classified.filter((c) => c && c.action === "card").map((c) => c!.target);
    expect(cardTargets).toEqual(expect.arrayContaining(["MDC", "JAL navi", "SAISON"]));
    // ことらは他人との送金かもしれないので、捨てずに口座の出金/入金として残す
    expect(classified.some((c) => c && c.action === "account")).toBe(true);
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
    expect(txns[0]).toMatchObject({ date: "2026-08-10", desc: "ＳＢＩハイブリッド預...", amount: 10000, balance: 14660 });
    expect(txns[1]).toMatchObject({ date: "2026-08-10", desc: "ATM　セブン銀行", amount: -17000, balance: 4660 });
    expect(txns[3]).toMatchObject({ date: "2026-08-08", desc: "ことら送金　ハヤシ　...", amount: -95000, balance: 20660 });
  });

  it("parseBankText: 日が前より大きくなったら前月へ遡ったとみなす(新しい順の一覧を過去へ辿る想定)", () => {
    const txns = parseBankText(neobankText, "2026-08");
    // 8日→30日で前月(7月)に切り替わる(日が前より大きくなった=遡って前月に入った)
    const afterRollover = txns.find((t) => t.desc.includes("エポス"));
    expect(afterRollover!.date).toBe("2026-07-29");
  });

  it("parseBankText: 月見出しが変わる複数月の明細を日付へ自動変換する", () => {
    const text = [
      "2026年5月", "12日", "入金 +1,000円", "残高11,000円",
      "2026年4月", "30日", "出金 -2,000円", "残高10,000円",
    ].join("\n");
    const txns = parseBankText(text);
    expect(txns).toEqual([
      { date: "2026-05-12", desc: "入金", amount: 1000, balance: 11000 },
      { date: "2026-04-30", desc: "出金", amount: -2000, balance: 10000 },
    ]);
  });

  it("classifyTxn/txnToEntry: ハイブリッド預金は投資振替、ATMは引出/預入として口座記録になる", () => {
    const rules = DEFAULT_CONFIG.importRules;
    const hybridIn = classifyTxn("ＳＢＩハイブリッド預...", rules);
    expect(hybridIn).toMatchObject({ action: "account", target: "NEOBANK", negItem: "投資振替", posItem: "投資振替" });
    expect(txnToEntry({ date: "2026-08-10", desc: "x", amount: 10000 }, hybridIn)).toMatchObject({ ym: "2026-08", cat: "account", item: "投資振替", account: "NEOBANK", amount: 10000 });
    expect(txnToEntry({ date: "2026-07-30", desc: "x", amount: -4000 }, hybridIn)).toMatchObject({ ym: "2026-07", cat: "account", item: "投資振替", account: "NEOBANK", amount: -4000 });

    const atm = classifyTxn("ATM　セブン銀行", rules);
    expect(txnToEntry({ date: "2026-08-10", desc: "x", amount: -17000 }, atm)).toMatchObject({ ym: "2026-08", cat: "account", item: "引出", account: "NEOBANK", amount: -17000 });
    expect(txnToEntry({ date: "2026-08-10", desc: "x", amount: 17000 }, atm)).toMatchObject({ ym: "2026-08", cat: "account", item: "預入", account: "NEOBANK", amount: 17000 });
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
    expect(classified.some((c) => c && c.negItem === "出金")).toBe(true); // ことら(他人との送金として残す)
  });
});

describe("cycleYm / periodLabel / periodRange", () => {
  it("cycleYm: 締め日で周期(開始月)へ振り分ける", () => {
    // 締め日0(未設定)は暦通り
    expect(cycleYm("2026-07-05", 0)).toBe("2026-07");
    // 締め日10: 11日〜翌月10日を1周期、開始月で呼ぶ
    expect(cycleYm("2026-06-11", 10)).toBe("2026-06");
    expect(cycleYm("2026-06-24", 10)).toBe("2026-06"); // 給与
    expect(cycleYm("2026-06-26", 10)).toBe("2026-06"); // カード
    expect(cycleYm("2026-07-05", 10)).toBe("2026-06"); // 翌月5日引き落とし → 6月度
    expect(cycleYm("2026-07-10", 10)).toBe("2026-06"); // 翌月10日 → 6月度
    expect(cycleYm("2026-07-11", 10)).toBe("2026-07"); // 11日から次の周期
  });
  it("periodLabel / periodRange", () => {
    expect(periodLabel("2026-06", 0)).toBe("2026年6月");
    expect(periodLabel("2026-06", 10)).toBe("2026年6月度");
    expect(periodRange("2026-06", 0)).toBe("");
    expect(periodRange("2026-06", 10)).toBe("6/11〜7/10");
    expect(periodRange("2026-04", 10)).toBe("4/11〜5/11");
    expect(periodRange("2026-05", 10)).toBe("5/12〜6/10");
  });
  it("isBankHoliday: 土日・祝日・年末年始", () => {
    expect(isBankHoliday("2026-01-12")).toBe(true);  // 成人の日(1月第2月曜)
    expect(isBankHoliday("2026-05-03")).toBe(true);  // 憲法記念日
    expect(isBankHoliday("2026-01-01")).toBe(true);  // 元日
    expect(isBankHoliday("2026-01-03")).toBe(true);  // 銀行の年末年始
    expect(isBankHoliday("2026-06-10")).toBe(false); // 平日(水)
    expect(isBankHoliday("2026-06-13")).toBe(true);  // 土曜
  });
  it("cycleYm: 締め日が土日祝なら翌営業日まで同じ周期に含める", () => {
    // 2026-01は 1/10(土)・1/11(日)・1/12(成人の日) と続き、締め日10は営業日1/13へ送られる
    expect(cycleYm("2026-01-10", 10)).toBe("2025-12"); // 前周期(12月度)
    expect(cycleYm("2026-01-12", 10)).toBe("2025-12"); // 振替でずれた分も前周期
    expect(cycleYm("2026-01-13", 10)).toBe("2025-12"); // 実際の引き落とし日(営業日)まで前周期
    expect(cycleYm("2026-01-14", 10)).toBe("2026-01"); // 翌日から新周期(1月度)
  });
  it("cycleStartDate: 締め日が日曜なら翌営業日のさらに翌日から始まる", () => {
    expect(cycleStartDate("2026-04", 10)).toBe("2026-04-11");
    // 2026/5/10(日)の引落は5/11(月)。5月度はその翌日の5/12から。
    expect(cycleStartDate("2026-05", 10)).toBe("2026-05-12");
  });
});

describe("evalAmount", () => {
  it("四則演算を評価する", () => {
    expect(evalAmount("1000+2000")).toBe(3000);
    expect(evalAmount("50000-3000")).toBe(47000);
    expect(evalAmount("2*3+4")).toBe(10);
    expect(evalAmount("10000/4")).toBe(2500);
    expect(evalAmount("(1+2)*3")).toBe(9);
  });
  it("¥・カンマ・全角演算子・空白を吸収する", () => {
    expect(evalAmount("¥1,200")).toBe(1200);
    expect(evalAmount("50,000 - 3,000")).toBe(47000);
    expect(evalAmount("1000＋2000")).toBe(3000);
    expect(evalAmount("2000×3")).toBe(6000);
    expect(evalAmount("9000÷3")).toBe(3000);
  });
  it("通常の数値・負数もそのまま数値化", () => {
    expect(evalAmount("1500")).toBe(1500);
    expect(evalAmount("-500")).toBe(-500);
    expect(evalAmount(3000)).toBe(3000);
  });
  it("無効な式は null", () => {
    expect(evalAmount("")).toBe(null);
    expect(evalAmount("abc")).toBe(null);
    expect(evalAmount("1000+")).toBe(null);
    expect(evalAmount("×")).toBe(null);
    expect(evalAmount(null)).toBe(null);
  });
});

describe("CSV取込", () => {
  it("parseCsvRows: 引用符内のカンマと改行、\"\"のエスケープ", () => {
    const rows = parseCsvRows('a,b\n"x,1","y""z"\n');
    expect(rows).toEqual([["a", "b"], ["x,1", 'y"z']]);
  });
  it("normalizeCsvDate: 各種表記", () => {
    expect(normalizeCsvDate("2026/7/5")).toBe("2026-07-05");
    expect(normalizeCsvDate("2026-07-05")).toBe("2026-07-05");
    expect(normalizeCsvDate("20260705")).toBe("2026-07-05");
    expect(normalizeCsvDate("2026年7月5日")).toBe("2026-07-05");
    expect(normalizeCsvDate("26/7/5")).toBe("2026-07-05");
    expect(normalizeCsvDate("あ")).toBe(null);
  });
  it("parseCsvAmount: 記号つき・和文マイナス", () => {
    expect(parseCsvAmount("1,234")).toBe(1234);
    expect(parseCsvAmount("¥1,234")).toBe(1234);
    expect(parseCsvAmount("△1,234")).toBe(-1234);
    expect(parseCsvAmount("▲500")).toBe(-500);
    expect(parseCsvAmount("(500)")).toBe(-500);
    expect(parseCsvAmount("-500")).toBe(-500);
    expect(parseCsvAmount("")).toBe(null);
    expect(parseCsvAmount("-")).toBe(null);
  });
  it("parseBankCsv: 出金/入金が別列＋残高列", () => {
    const csv = [
      "日付,摘要,出金金額,入金金額,残高",
      "2026/06/24,給与 カ)カイシャ,,320000,500000",
      "2026/06/26,カード引落 SMCC,45000,,455000",
      "2026/07/02,ATM引出,30000,,425000",
    ].join("\n");
    const r = parseBankCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.txns.length).toBe(3);
    // 各行に残高も持たせる(月度ごとの期末残高を取り出すのに使う)
    expect(r.txns[0]).toEqual({ date: "2026-06-24", desc: "給与 カ)カイシャ", amount: 320000, balance: 500000 });
    expect(r.txns[1].amount).toBe(-45000);
    // 残高は最新日のものを採用
    expect(r.balance).toEqual({ date: "2026-07-02", amount: 425000 });
  });
  it("parseBankCsv: 金額1列・前置き行あり・降順でも最新残高を取る", () => {
    const csv = [
      "○○銀行 入出金明細",
      "口座番号,1234567",
      "",
      "取引日,取引内容,金額,残高",
      "2026/07/02,ATM,-30000,425000",
      "2026/06/24,給与,320000,500000",
    ].join("\n");
    const r = parseBankCsv(csv);
    expect(r.txns.length).toBe(2);
    expect(r.txns[0].amount).toBe(-30000);
    expect(r.balance).toEqual({ date: "2026-07-02", amount: 425000 });
  });
  it("parseBankCsv: カード明細(残高なし)", () => {
    const csv = ["ご利用日,ご利用店名,ご利用金額", "2026/06/15,スーパー,3200", "2026/06/18,ガソリン,5000"].join("\n");
    const r = parseBankCsv(csv);
    expect(r.txns.length).toBe(2);
    expect(r.balance).toBe(null);
    expect(r.txns[0].desc).toBe("スーパー");
  });
  it("parseBankCsv: 列が見つからなければエラー", () => {
    expect(parseBankCsv("あ,い\n1,2").error).toBeTruthy();
  });
});

describe("CSV取込: 実データ形式(NEOBANK)", () => {
  // 新しい順・同日に複数行・全角・列名に(円)・引用符つき
  const csv = [
    '"日付","内容","出金金額(円)","入金金額(円)","残高(円)","メモ"',
    '"2026/07/24","ＳＢＩハイブリッド預金","20,000",,"2,253","-"',
    '"2026/07/24","ＳＢＩハイブリッド預金","60,000",,"22,253","-"',
    '"2026/07/24","ことら送金　ハヤシ　シユンヤ （2026...）",,"80,000","82,253","-"',
    '"2026/07/19","利息",,"3","4,253","-"',
    '"2026/07/10","ＡＴＭ　ゆうちょ銀行","16,000",,"4,660","-"',
  ].join("\n");
  const r = parseBankCsv(csv);
  it("列名に(円)が付いていても認識する", () => {
    expect(r.error).toBeUndefined();
    expect(r.txns.length).toBe(5);
  });
  it("出金は負・入金は正", () => {
    expect(r.txns[0].amount).toBe(-20000);
    expect(r.txns[2].amount).toBe(80000);
    expect(r.txns[3].amount).toBe(3);
  });
  it("新しい順のCSVでは先頭行の残高が最新(同日に複数行あっても取り違えない)", () => {
    expect(r.balance).toEqual({ date: "2026-07-24", amount: 2253 });
  });
  it("全角の摘要も既存ルールで判定できる(NFKC正規化)", () => {
    const rules: ImportRule[] = [
      { id: "1", match: "ハイブリッド", action: "account", target: "NEOBANK", negItem: "投資振替", posItem: "投資振替" },
      { id: "2", match: "ATM", action: "account", target: "NEOBANK", negItem: "引出", posItem: "預入" },
    ];
    expect(classifyTxn(r.txns[0].desc, rules)).toMatchObject({ action: "account", negItem: "投資振替" });
    expect(classifyTxn(r.txns[4].desc, rules)).toMatchObject({ action: "account", negItem: "引出" });
  });
});

describe("取込の重複防止", () => {
  const cls = { action: "account" as const, target: "NEOBANK", negItem: "引出", posItem: "預入" };
  it("txnKey: 日付・金額・摘要が同じなら同じ指紋", () => {
    const a = { date: "2026-07-10", desc: "ＡＴＭ　セブン銀行", amount: -17000 };
    const b = { date: "2026-07-10", desc: "ATM セブン銀行", amount: -17000 }; // 全角/半角・空白の違い
    expect(txnKey(a)).toBe(txnKey(b));
  });
  it("txnKey: 日付か金額が違えば別の指紋(同じ日の同額でない限り別物として残る)", () => {
    const base = { date: "2026-07-10", desc: "ATM", amount: -17000 };
    expect(txnKey(base)).not.toBe(txnKey({ ...base, date: "2026-07-11" }));
    expect(txnKey(base)).not.toBe(txnKey({ ...base, amount: -16000 }));
  });
  it("txnToEntry: 指紋(src)を持たせる", () => {
    const e = txnToEntry({ date: "2026-07-10", desc: "ATM", amount: -17000 }, cls, 10)!;
    expect(e.src).toBe(txnKey({ date: "2026-07-10", desc: "ATM", amount: -17000 }));
  });
  it("重なったスクショ内の同じ日付・金額・摘要を1件にまとめる", () => {
    const txns = [
      { date: "2026-04-24", desc: "送金 ニッポン シュウセイフドウ", amount: 2102 },
      { date: "2026-04-24", desc: "送金　ニッポン　シュウセイフドウ", amount: 2102 },
      { date: "2026-04-22", desc: "送金 富田 翔馬", amount: 3700 },
    ];
    expect(dedupeTxns(txns)).toHaveLength(2);
  });
  it("OCR摘要が揺れても日付・金額・取引後残高が同じなら重複にする", () => {
    const txns = [
      { date: "2026-04-24", desc: "送金 ニッポン", amount: 2102, balance: 76522 },
      { date: "2026-04-24", desc: "送金 ニッボン", amount: 2102, balance: 76522 },
    ];
    expect(dedupeTxns(txns)).toHaveLength(1);
  });
  it("同日・同額・同摘要でも取引後残高が違えば実在する別取引として残す", () => {
    const txns = [
      { date: "2026-04-30", desc: "入金", amount: 400, balance: 211943 },
      { date: "2026-04-30", desc: "入金", amount: 400, balance: 132343 },
    ];
    expect(dedupeTxns(txns)).toHaveLength(2);
  });
  it("開始残高から画像順に依存せず全件のOCR残高を検算する", () => {
    const txns = [
      { date: "2026-04-30", desc: "入金", amount: 400, balance: 132343 },
      { date: "2026-04-13", desc: "送金", amount: 24000, balance: 55570 },
      { date: "2026-04-30", desc: "入金", amount: 2600, balance: 131943 },
      { date: "2026-04-30", desc: "ことら", amount: -80000, balance: 129343 },
      { date: "2026-04-20", desc: "振込", amount: 153773, balance: 209343 },
    ];
    const ok = verifyOcrBalanceChain(txns, 31570);
    expect(ok.mismatched).toBe(0);
    expect(ok.checked).toBe(5);
    expect(ok.finalBalance).toBe(132343);
    const bad = verifyOcrBalanceChain(txns, 31571);
    expect(bad.mismatched).toBeGreaterThan(0);
  });
  it("同じCSVを2回取り込んでも、既存のsrcと一致する分は除外できる", () => {
    const txns = [
      { date: "2026-07-10", desc: "ＡＴＭ　セブン銀行", amount: -17000 },
      { date: "2026-07-18", desc: "ことら送金　タケナカ", amount: 4100 },
    ];
    const first = txns.map((t) => txnToEntry(t, cls, 10)!);
    const existing = new Set(first.map((e) => e.src));
    // 2回目: 全件が既存と一致するので取り込む対象は0件
    const second = txns.map((t) => txnToEntry(t, cls, 10)!).filter((e) => !existing.has(e.src));
    expect(second).toHaveLength(0);
    // 新しい取引が1件増えた場合はその1件だけ通る
    const withNew = [...txns, { date: "2026-07-20", desc: "ＡＴＭ　ゆうちょ", amount: -5000 }]
      .map((t) => txnToEntry(t, cls, 10)!).filter((e) => !existing.has(e.src));
    expect(withNew).toHaveLength(1);
    expect(withNew[0].amount).toBe(-5000);
  });
});

describe("口座スクショの自動判別と振り分け", () => {
  it("ゆうちょ固有の手掛かりが複数あればゆうちょを選ぶ", () => {
    expect(guessYuchoScreenshotAccount("明細\n自払 JCBカード\nことら ハヤシ シュンヤ\n受取利子", ["ゆうちょ", "NEOBANK"])).toBe("ゆうちょ");
    expect(guessYuchoScreenshotAccount("明細\nことら", ["ゆうちょ", "NEOBANK"])).toBeNull();
  });
  it("口座明細のカード引落はカード請求として取り込む(二重計上は入力済み判定で防ぐ)", () => {
    expect(classifyTxnForImport("自払 JCBカード", DEFAULT_CONFIG.importRules, { action: "account", target: "ゆうちょ" }))
      .toMatchObject({ action: "card", target: "JAL navi" });
    expect(classifyTxnForImport("自 払 ミツビシ", DEFAULT_CONFIG.importRules, { action: "account", target: "ゆうちょ" }))
      .toMatchObject({ action: "card", target: "MDC" });
  });
  it("自払でもセブンATMの引出は除外せず口座支出にする", () => {
    expect(classifyTxnForImport("自払 セブン", DEFAULT_CONFIG.importRules, { action: "account", target: "ゆうちょ" }))
      .toEqual({ action: "account", target: "ゆうちょ" });
  });
  it("口座ルールの振り分け先はスクショ元の口座へ揃える", () => {
    expect(classifyTxnForImport("ことら ハヤシ シュンヤ", DEFAULT_CONFIG.importRules, { action: "account", target: "ゆうちょ" }))
      .toMatchObject({ action: "account", target: "ゆうちょ" });
  });
  it("実画像で誤読されたハヤシ名義も自分の口座として判定する", () => {
    expect(matchesOwnName("どどちら 八 ヤシ ーー シタ ユン シンヤ", ["ハヤシシュンヤ"])).toBe(true);
  });
});

describe("CSV取込: ゆうちょ形式(摘要が複数列・古い順・列名の揺れ)", () => {
  // 「入出金明細ＩＤ」は「出金」を含むため、素朴な部分一致だとIDを金額として読んでしまう。
  const csv = [
    "お客さま口座情報",
    '現在高：,"404,784",円,',
    "明細件数：4",
    "取引日,入出金明細ＩＤ,受入金額（円）,払出金額（円）,詳細１,詳細２,現在（貸付）高,",
    "20260716,202607160000001,1600,,ことら,ﾔｽﾄﾒﾁｾ,4456,",
    "20260718,202607180000001,30000,,ことら,ﾓﾘｱｲ ｺﾀﾛｳ,34456,",
    "20260718,202607180000002,7500,,ことら,ﾊﾔｼ ｼﾕﾝﾔ,41956,",
    "20260718,202607180000003,,40700,ことら,ﾓﾘｱｲ ｺﾀﾛｳ,1256,",
    "20260724,202607240000001,385850,,給与,ﾆﾂﾎﾟﾝﾕｳｾｲﾌﾄ,387106,",
  ].join("\n");
  const r = parseBankCsv(csv);
  it("明細IDを金額と誤認しない", () => {
    expect(r.txns.map((t) => t.amount)).toEqual([1600, 30000, 7500, -40700, 385850]);
  });
  it("摘要は詳細1と詳細2をつないで使う(相手名まで取れる)", () => {
    expect(r.txns[0].desc).toBe("ことら ﾔｽﾄﾒﾁｾ");
    expect(r.txns[4].desc).toBe("給与 ﾆﾂﾎﾟﾝﾕｳｾｲﾌﾄ");
  });
  it("古い順のCSVでは末尾が最新の残高", () => {
    expect(r.balance).toEqual({ date: "2026-07-24", amount: 387106 });
  });
  it("残高で検算でき、全件一致する", () => {
    expect(r.balanceCheck).toMatchObject({ checked: 4, mismatched: 0 });
  });
  it("半角カナの相手名も自分名義として判定できる(NFKC)", () => {
    expect(matchesOwnName("ことら ﾊﾔｼ ｼﾕﾝﾔ", ["ハヤシ シユンヤ"])).toBe(true);
  });
  it("読み取りがずれていれば検算が不一致として気付ける", () => {
    const broken = csv.replace("30000,,ことら,ﾓﾘｱｲ ｺﾀﾛｳ,34456", "39000,,ことら,ﾓﾘｱｲ ｺﾀﾛｳ,34456");
    expect(parseBankCsv(broken).balanceCheck!.mismatched).toBeGreaterThan(0);
    // 行がまるごと欠けても検算で気付ける
    const missing = csv.split("\n").filter((l) => !l.includes("0000002")).join("\n");
    expect(parseBankCsv(missing).balanceCheck!.mismatched).toBeGreaterThan(0);
  });
});

describe("給与ルールの既定と移行", () => {
  it("既存の設定にも一度だけ追加され、消したら復活しない", () => {
    const before = { accounts: ["A"], salaryItems: [], importRules: [{ id: "x", match: "ATM", action: "account", target: "A" }] };
    const after = migrateConfig(before);
    const rules = after.importRules as ImportRule[];
    expect(rules.filter((r: ImportRule) => r.action === "salary").map((r: ImportRule) => r.match)).toEqual(["給与", "賞与"]);
    expect(after.importRulesSeeded).toBe(4);
    // 利用者が消したあとに読み込み直しても復活しない
    const removed = { ...after, importRules: rules.filter((r: ImportRule) => r.match !== "給与") };
    expect((migrateConfig(removed).importRules as ImportRule[]).some((r: ImportRule) => r.match === "給与")).toBe(false);
  });
});

describe("口座間の振替は同日・同額・逆符号・別口座の組で判定する", () => {
  const own = ["ハヤシ シユンヤ"];
  const mk = (date: string, amount: number, group: number, desc: string) =>
    ({ date, amount, group, own: matchesOwnName(desc, own) });
  it("氏名の小書きカナと銀行CSVの大きいカナを同一視する", () => {
    expect(matchesOwnName("ことら ﾊﾔｼ ｼﾕﾝﾔ", ["ハヤシシュンヤ"])).toBe(true);
  });
  it("組が揃えば両方とも振替になる", () => {
    // NEOBANKから出た7,500がゆうちょに入っている
    const items = [
      mk("2026-07-18", -7500, 0, "ことら送金　ハヤシ　シユンヤ"),
      mk("2026-07-18", 7500, 1, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
    ];
    expect(pairOwnTransfers(items)).toEqual([1, 0]);
  });
  it("相手がいなければ振替にしない(同じ名字の他人とのやり取りを消さない)", () => {
    const items = [mk("2026-07-24", 9980, 0, "振込 ﾊﾔｼ ｼﾕﾝﾔ")];
    expect(pairOwnTransfers(items)).toEqual([-1]);
  });
  it("同じ口座の中の同額・逆符号は振替にしない", () => {
    const items = [
      mk("2026-07-18", -7500, 0, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
      mk("2026-07-18", 7500, 0, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
    ];
    expect(pairOwnTransfers(items)).toEqual([-1, -1]);
  });
  it("日付か金額が違えば組にしない", () => {
    expect(pairOwnTransfers([
      mk("2026-07-18", -7500, 0, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
      mk("2026-07-19", 7500, 1, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
    ])).toEqual([-1, -1]);
    expect(pairOwnTransfers([
      mk("2026-07-18", -7500, 0, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
      mk("2026-07-18", 7000, 1, "ことら ﾊﾔｼ ｼﾕﾝﾔ"),
    ])).toEqual([-1, -1]);
  });
  it("自分名義でない取引は組にしない", () => {
    const items = [
      { date: "2026-07-18", amount: -7500, group: 0, own: false },
      { date: "2026-07-18", amount: 7500, group: 1, own: false },
    ];
    expect(pairOwnTransfers(items)).toEqual([-1, -1]);
  });
  it("同額の組が複数あっても1対1で消化する", () => {
    const items = [
      mk("2026-07-18", -5000, 0, "ハヤシ シユンヤ"),
      mk("2026-07-18", -5000, 0, "ハヤシ シユンヤ"),
      mk("2026-07-18", 5000, 1, "ハヤシ シユンヤ"),
    ];
    const p = pairOwnTransfers(items);
    expect(p.filter((x) => x >= 0)).toHaveLength(2); // 1組だけ成立、余った1件は残る
    expect(p[2]).toBeGreaterThanOrEqual(0);
  });
});

describe("取込データの復元(ショートカット経由)", () => {
  const csv = "日付,内容,出金金額,入金金額,残高\n2026/07/10,ATM,17000,,4660\n";
  const b64of = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  it("Base64で渡ってきたUTF-8のCSVを復元する", () => {
    const b64 = b64of(csv);
    expect(decodeImportPayload(b64)).toBe(csv);
  });
  it("そのままのCSVはそのまま返す", () => {
    expect(decodeImportPayload(csv)).toBe(csv);
  });
  it("Base64に見えてもCSVでなければ元の文字列を返す", () => {
    const b64 = b64of("これはCSVではない文章です");
    expect(decodeImportPayload(b64)).toBe(b64);
  });
  it("空や短い文字列で壊れない", () => {
    expect(decodeImportPayload("")).toBe("");
    expect(decodeImportPayload("abc")).toBe("abc");
  });
});

describe("取込データの復元: 異常系", () => {
  const csv = "日付,内容,出金金額,入金金額,残高\n2026/07/10,ATM,17000,,4660\n";
  const b64of = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  it("URL安全なBase64(-と_)も復元できる", () => {
    const b64 = b64of(csv).replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodeImportPayload(b64)).toBe(csv);
  });
  it("改行の入ったBase64も復元できる", () => {
    const b64 = b64of(csv).replace(/(.{20})/g, "$1\n");
    expect(decodeImportPayload(b64)).toBe(csv);
  });
  it("URLが渡された場合はそのまま返す(CSVとして扱わない)", () => {
    const url = "https://direct2.jp-bank.japanpost.jp/tp1web/U010101SCR.do";
    expect(decodeImportPayload(url)).toBe(url);
  });
});

describe("既存の記録から口座間の振替を探す", () => {
  const own = ["ハヤシ シユンヤ"];
  const mk = (id: string, ym: string, item: string, account: string, amount: number, src?: string) =>
    ({ id, ym, cat: "account" as const, item, account, amount, src });
  it("同じ日・同額・逆向き・別口座なら組にする(取込済みの記録)", () => {
    const es = [
      mk("a", "2026-04", "出金", "ゆうちょ", -80000, "2026-04-20|-80000|ことらハヤシシユンヤ"),
      mk("b", "2026-04", "入金", "NEOBANK", 80000, "2026-04-20|80000|ことらハヤシシユンヤ"),
    ];
    const r = findInternalTransfers(es, own);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ outId: "a", inId: "b", amount: 80000, certain: true });
  });
  it("日付が無い記録(手入力・旧取込)は同じ月なら組にする", () => {
    const es = [mk("a", "2026-04", "出金", "ゆうちょ", -80000), mk("b", "2026-04", "入金", "NEOBANK", 80000)];
    const r = findInternalTransfers(es, own);
    expect(r).toHaveLength(1);
    expect(r[0].certain).toBe(false);   // 名義も日付も確認できないので要確認
  });
  it("着金が翌日でも組にする(振込は1日ずれることがある)", () => {
    const es = [
      mk("a", "2026-04", "出金", "ゆうちょ", -80000, "2026-04-20|-80000|フリコミハヤシシユンヤ"),
      mk("b", "2026-04", "入金", "NEOBANK", 80000, "2026-04-21|80000|フリコミハヤシシユンヤ"),
    ];
    expect(findInternalTransfers(es, own)).toHaveLength(1);
  });
  it("同じ口座の中の動き・違う額・違う月は組にしない", () => {
    expect(findInternalTransfers([mk("a", "2026-04", "出金", "ゆうちょ", -80000), mk("b", "2026-04", "入金", "ゆうちょ", 80000)], own)).toHaveLength(0);
    expect(findInternalTransfers([mk("a", "2026-04", "出金", "ゆうちょ", -80000), mk("b", "2026-04", "入金", "NEOBANK", 70000)], own)).toHaveLength(0);
    expect(findInternalTransfers([mk("a", "2026-04", "出金", "ゆうちょ", -80000), mk("b", "2026-05", "入金", "NEOBANK", 80000)], own)).toHaveLength(0);
  });
  it("残高や既に口座振替のものは対象にしない", () => {
    const es = [
      mk("a", "2026-04", "残高", "ゆうちょ", -80000), mk("b", "2026-04", "残高", "NEOBANK", 80000),
      mk("c", "2026-04", "口座振替", "ゆうちょ", -50000), mk("d", "2026-04", "口座振替", "NEOBANK", 50000),
    ];
    expect(findInternalTransfers(es, own)).toHaveLength(0);
  });
  it("1対1で消化する(同額が3件あっても2件だけ組になる)", () => {
    const es = [
      mk("a", "2026-04", "出金", "ゆうちょ", -80000), mk("b", "2026-04", "出金", "ゆうちょ", -80000),
      mk("c", "2026-04", "入金", "NEOBANK", 80000),
    ];
    expect(findInternalTransfers(es, own)).toHaveLength(1);
  });
});

describe("残高は総額で照合する", () => {
  const t = (date: string, amount: number, balance?: number) => ({ date, desc: "x", amount, ...(balance != null ? { balance } : {}) });
  it("開始残高＋取引の合計＝最終残高 なら合格", () => {
    const r = verifyBalanceTotal([t("2026-07-01", -1000, 9000), t("2026-07-05", 500, 9500)], 10000)!;
    expect(r).toMatchObject({ ok: true, opening: 10000, sum: -500, closing: 9500, diff: 0, count: 2 });
  });
  it("途中の残高が読めなくても、最終残高が合えば合格", () => {
    const r = verifyBalanceTotal([t("2026-07-01", -1000), t("2026-07-05", 500, 9500)], 10000)!;
    expect(r.ok).toBe(true);
  });
  it("取りこぼしがあればズレとして出る", () => {
    const r = verifyBalanceTotal([t("2026-07-05", 500, 9500)], 10000)!;
    expect(r.ok).toBe(false);
    expect(r.diff).toBe(1000); // −1000の明細を読み落としている
  });
  it("最終残高が読めない・開始残高が無い場合は照合しない", () => {
    expect(verifyBalanceTotal([t("2026-07-01", -1000)], 10000)).toBeNull();
    expect(verifyBalanceTotal([t("2026-07-01", -1000, 9000)], NaN)).toBeNull();
  });
});

describe("カード明細CSVの取り込み", () => {
  const card = (ym: string, item: string, amount: number) => ({ ym, cat: "card" as const, item, account: "", amount });
  it("残高列が無く全行が同じ向きならカード明細とみなす", () => {
    const t = (a: number) => ({ date: "2026-06-10", desc: "店", amount: a });
    expect(isCardStatement([t(-1200), t(-800)], false)).toBe(true);
    expect(isCardStatement([t(-1200), t(800)], false)).toBe(false);  // 入出金が混ざる=口座
    expect(isCardStatement([t(-1200)], true)).toBe(false);           // 残高列あり=口座
    expect(isCardStatement([], false)).toBe(false);
  });
  it("請求額の合計からカードと月を特定できる", () => {
    const es = [card("2026-06", "EPOS", 15322), card("2026-06", "PayPay", 5314), card("2026-05", "EPOS", 9800)];
    expect(findCardByTotal(15322, es)).toEqual({ card: "EPOS", ym: "2026-06" });
    expect(findCardByTotal(5314, es)).toEqual({ card: "PayPay", ym: "2026-06" });
  });
  it("同じ額が複数あって絞れない場合と、一致が無い場合はnull", () => {
    const es = [card("2026-06", "EPOS", 10000), card("2026-06", "PayPay", 10000)];
    expect(findCardByTotal(10000, es)).toBeNull();
    expect(findCardByTotal(12345, es)).toBeNull();
  });
  it("明細が複数行に分かれていても合計で照合する", () => {
    const es = [card("2026-06", "EPOS", 10000), card("2026-06", "EPOS", 5322)];
    expect(findCardByTotal(15322, es)).toEqual({ card: "EPOS", ym: "2026-06" });
    expect(cardMonthTotal(es, "EPOS", "2026-06")).toBe(15322);
  });
});

describe("給与の取り込み(未入力なら手取りとして取り込む)", () => {
  it("既定ルールで給与・賞与は給与として分類される", () => {
    expect(classifyTxn("給与 ﾆﾂﾎﾟﾝﾕｳｾｲﾌﾄ", DEFAULT_CONFIG.importRules)).toMatchObject({ action: "salary", target: "給与" });
    expect(classifyTxn("賞与 ﾆﾂﾎﾟﾝﾕｳｾｲﾌﾄ", DEFAULT_CONFIG.importRules)).toMatchObject({ action: "salary", target: "賞与" });
  });
  it("入金額を手取りとして給与のentryにする", () => {
    const e = txnToEntry({ date: "2026-07-24", desc: "給与 ﾆﾂﾎﾟﾝﾕｳｾｲﾌﾄ", amount: 385850 },
      { action: "salary", target: "給与" }, 10)!;
    expect(e).toMatchObject({ ym: "2026-07", cat: "salary", item: "給与", amount: 385850 });
  });
  it("旧「取り込まない」ルールは給与として取り込む設定へ移行する", () => {
    const before = { accounts: [], salaryItems: [], importRulesSeeded: 1,
      importRules: [{ id: "a", match: "給与", action: "skip" }, { id: "b", match: "賞与", action: "skip" }] };
    const rules = migrateConfig(before).importRules as ImportRule[];
    expect(rules.filter((r) => r.match === "給与" || r.match === "賞与").map((r) => [r.match, r.action]))
      .toEqual([["給与", "salary"], ["賞与", "salary"]]);
  });
});

describe("自払などの引き落としからカードを推測する", () => {
  const cards = ["EPOS", "JCB Gold", "SMCC Gold"];
  const card = (ym: string, item: string, amount: number) => ({ ym, cat: "card" as const, item, account: "", amount });
  it("引き落としらしい摘要を見分ける", () => {
    expect(DEBIT_HINT_RE.test("自払 ｼﾞｪｰｼｰﾋﾞｰ")).toBe(true);
    expect(DEBIT_HINT_RE.test("口座振替 エポスカード")).toBe(true);
    expect(DEBIT_HINT_RE.test("ATM引出")).toBe(false);
    expect(DEBIT_HINT_RE.test("ことら送金 タナカ")).toBe(false);
  });
  it("摘要にカード名があればそれを使う", () => {
    expect(guessCardForDebit("自払 EPOS", -15322, "2026-06", cards, [])).toBe("EPOS");
  });
  it("カード名が無くても、その月度の入力済み請求額と一致すれば特定できる", () => {
    const es = [card("2026-06", "JCB Gold", 7777)];
    expect(guessCardForDebit("自払 ****", -7777, "2026-06", cards, es)).toBe("JCB Gold");
    // 別の月度の一致は使わない
    expect(guessCardForDebit("自払 ****", -7777, "2026-07", cards, es)).toBeNull();
  });
  it("手がかりが無ければnull(利用者が選ぶ)", () => {
    expect(guessCardForDebit("自払 ****", -1234, "2026-06", cards, [])).toBeNull();
  });
});

describe("残高は記録の無い月に前月から引き継ぐ", () => {
  const bal = (ym: string, account: string, amount: number) => ({ ym, cat: "account" as const, item: "残高", account, amount });
  const es = [bal("2026-03", "ゆうちょ", 50000), bal("2026-03", "NEOBANK", 20000), bal("2026-05", "ゆうちょ", 60000)];
  it("記録の無い4月は3月の残高を引き継ぐ", () => {
    expect(balancesAsOf(es, "2026-04")).toEqual({ "ゆうちょ": { amount: 50000, ym: "2026-03" }, "NEOBANK": { amount: 20000, ym: "2026-03" } });
    expect(balTotalAsOf(es, "2026-04")).toBe(70000);
  });
  it("記録のある月はその月の残高を使う", () => {
    expect(balancesAsOf(es, "2026-05")["ゆうちょ"]).toEqual({ amount: 60000, ym: "2026-05" });
    expect(balTotalAsOf(es, "2026-05")).toBe(80000);   // ゆうちょ6万 + NEOBANK 2万(3月から)
  });
  it("その月より後の記録は使わない", () => {
    expect(balTotalAsOf(es, "2026-02")).toBeNull();
    expect(balancesAsOf(es, "2026-03")["ゆうちょ"]!.amount).toBe(50000);
  });
});

describe("引き落としの支払先名", () => {
  it("自払などの語を取り除いて支払先を取り出す", () => {
    expect(payeeFromDebit("自払 ｼﾞｪｰｼｰﾋﾞｰ")).toBe("ジェーシービー");   // 半角カナは全角へ揃える
    expect(payeeFromDebit("口座振替　エポスカード")).toBe("エポス");
    expect(payeeFromDebit("自動払込 トウキヨウガス")).toBe("トウキヨウガス");
  });
  it("名前が残らない場合も空にしない", () => {
    expect(payeeFromDebit("自払")).toBe("引き落とし");
  });
});

describe("OCRの字間の空白があっても自払を見分ける", () => {
  it("「自 払 セソ * ン」のように空白が入っても引き落としと分かる", () => {
    expect(isDebitDesc("自 払 セソ * ン")).toBe(true);
    expect(isDebitDesc("自 払 JCB_ カート *^")).toBe(true);
    expect(isDebitDesc("自払 ｼﾞｪｰｼｰﾋﾞｰ")).toBe(true);
    expect(isDebitDesc("こと ら ハヤ シ シュ ン ヤ")).toBe(false);
    expect(isDebitDesc("ATM引出")).toBe(false);
  });
  it("支払先の名前も空白を落として取り出す", () => {
    expect(payeeFromDebit("自 払 セソ * ン")).toBe("セソン");
    expect(payeeFromDebit("自 払 JCB_ カート *^")).toBe("JCBカート");   // OCRの誤読はそのまま残す(後から直せる)
  });
});

describe("OCRの読み取り結果を整える", () => {
  it("日本語の字間の空白を詰める", () => {
    expect(cleanOcrText("自 払 セソ ン")).toBe("自払セソン");
    expect(cleanOcrText("こと ら ハヤ シ シュ ン ヤ")).toBe("ことらハヤシシュンヤ");
  });
  it("飾り記号を落とす", () => {
    // 英数字と日本語の間の空白は語の区切りとして残す
    expect(cleanOcrText("自 払 JCB_ カート *^")).toBe("自払 JCB カート");
  });
  it("数字や日付は壊さない", () => {
    expect(cleanOcrText("2026/04/10 -2,774")).toBe("2026/04/10 -2,774");
    expect(cleanOcrText("50000")).toBe("50000");
  });
  it("行の構造は保つ", () => {
    expect(cleanOcrText("自 払 セソ ン\n-68,000")).toBe("自払セソン\n-68,000");
  });
});

describe("同じ支払先を金額で分ける / 符号を残高から直す", () => {
  it("三井住友は294のときsmcc、それ以外はSMCC Gold", () => {
    const r = DEFAULT_CONFIG.importRules;
    expect(classifyTxn("自払 三井住友カード", r, -294)).toMatchObject({ action: "card", target: "smcc" });
    expect(classifyTxn("自払 三井住友カード", r, -12345)).toMatchObject({ action: "card", target: "SMCC Gold" });
    expect(classifyTxn("自払ミツイスミトモ", r, 294)).toMatchObject({ action: "card", target: "smcc" });
  });
  it("金額が分からないときは金額つきルールを当てない", () => {
    expect(classifyTxn("自払 三井住友カード", DEFAULT_CONFIG.importRules)).toMatchObject({ target: "SMCC Gold" });
  });
  it("マイナスを読み落としても残高の増減から符号を直す", () => {
    // 新しい順。残高が減っているので出金
    const fixed = fixSignsFromBalances([
      { date: "2026-04-11", desc: "自払 三井住友", amount: 294, balance: 9706 },
      { date: "2026-04-10", desc: "前の取引", amount: -1000, balance: 10000 },
    ]);
    expect(fixed[0].amount).toBe(-294);
  });
  it("増減と金額の大きさが合わないときは触らない", () => {
    const fixed = fixSignsFromBalances([
      { date: "2026-04-11", desc: "x", amount: 500, balance: 9706 },
      { date: "2026-04-10", desc: "y", amount: -1000, balance: 10000 },
    ]);
    expect(fixed[0].amount).toBe(500);
  });
});

describe("JRE BANKのスクショ(日付・金額・残高が1行、摘要が次の行)", () => {
  const text = [
    "取引日 入出金(円) 残高(円)",
    "2026年07月",
    "07/06 -156,750 649",
    "カ）ビューカード",
    "07/04 137,000 157,399",
    "ハヤシ シユンヤ",
    "2026年06月",
    "06/22 19,760 20,399",
    "カ）ビユーカード",
  ].join("\n");
  const txns = parseBankText(cleanOcrText(text));
  it("日付・金額・残高と、次の行の摘要を組にする", () => {
    expect(txns).toHaveLength(3);
    expect(txns[0]).toMatchObject({ date: "2026-07-06", amount: -156750, balance: 649 });
    expect(txns[0].desc).toContain("ビューカード");
    expect(txns[1]).toMatchObject({ date: "2026-07-04", amount: 137000, balance: 157399 });
    expect(txns[2]).toMatchObject({ date: "2026-06-22", amount: 19760, balance: 20399 });
  });
  it("ビューカードはVIEWの引き落としとして振り分ける", () => {
    expect(classifyTxn(txns[0].desc, DEFAULT_CONFIG.importRules, txns[0].amount))
      .toMatchObject({ action: "card", target: "VIEW" });
  });
  it("ハヤシ シユンヤは自分名義として口座間振替の対象になる", () => {
    expect(matchesOwnName(txns[1].desc, ["ハヤシ シユンヤ"])).toBe(true);
  });
});

describe("JRE BANK: OCRが列ごとに行を分けても読める", () => {
  it("日付・金額・残高が別々の行でも1件にまとめる", () => {
    const text = ["2026年07月", "07/06", "-156,750", "649", "カ）ビューカード",
                  "07/04", "137,000", "157,399", "ハヤシ シユンヤ"].join("\n");
    const t = parseBankText(cleanOcrText(text));
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ date: "2026-07-06", amount: -156750, balance: 649 });
    expect(t[0].desc).toContain("ビューカード");
    expect(t[1]).toMatchObject({ date: "2026-07-04", amount: 137000, balance: 157399 });
  });
  it("全角のマイナスでも読める", () => {
    const t = parseBankText(cleanOcrText(["2026年07月", "07/06 −156,750 649", "カ）ビューカード"].join("\n")));
    expect(t[0].amount).toBe(-156750);
  });
  it("月見出しをまたいでも年月が正しく付く", () => {
    const text = ["2026年07月", "07/06", "-156,750", "649", "カ）ビューカード",
                  "2026年06月", "06/22", "19,760", "20,399", "カ）ビユーカード"].join("\n");
    const t = parseBankText(cleanOcrText(text));
    expect(t.map((x) => x.date)).toEqual(["2026-07-06", "2026-06-22"]);
  });
});

describe("月度ごとの残高照合", () => {
  const bal = (ym: string, account: string, amount: number) => ({ ym, cat: "account" as const, item: "残高", account, amount });
  const card = (ym: string, amount: number) => ({ ym, cat: "card" as const, item: "EPOS", account: "", amount });
  const salary = (ym: string, amount: number) => ({ ym, cat: "salary" as const, item: "給与", account: "", amount });
  it("期首残高＋増減＝期末残高 なら一致", () => {
    // 3月度末10万 → 4月度は給与+30万・カード-5万 → 期末35万
    const es = [bal("2026-03", "A", 100000), salary("2026-04", 300000), card("2026-04", 50000), bal("2026-04", "A", 350000)];
    const r = verifyCycles(es).find((x) => x.ym === "2026-04")!;
    expect(r).toMatchObject({ opening: 100000, net: 250000, expected: 350000, closing: 350000, diff: 0, ok: true });
  });
  it("取りこぼしがあれば差として出る", () => {
    const es = [bal("2026-03", "A", 100000), salary("2026-04", 300000), bal("2026-04", "A", 350000)];
    const r = verifyCycles(es).find((x) => x.ym === "2026-04")!;
    expect(r.ok).toBe(false);
    expect(r.diff).toBe(-50000);   // 記録に無い5万の支出がある
  });
  it("その月度に残高の記録が無ければ照合しない", () => {
    const es = [bal("2026-03", "A", 100000), salary("2026-04", 300000)];
    const r = verifyCycles(es).find((x) => x.ym === "2026-04")!;
    expect(r.closing).toBeNull();
    expect(r.ok).toBe(false);
  });
  it("全ての月度を返す", () => {
    const es = [bal("2026-03", "A", 100000), bal("2026-04", "A", 100000), bal("2026-05", "A", 100000)];
    expect(verifyCycles(es).map((r) => r.ym)).toEqual(["2026-03", "2026-04", "2026-05"]);
  });
});

describe("JRE BANK: 数字が1つしか読めない行は取り込まない", () => {
  it("金額か残高か判別できない行は捨てる(残高を入金にしない)", () => {
    const text = ["2026年06月", "06/22", "20,399", "カ）ビユーカード"].join("\n");
    expect(parseBankText(cleanOcrText(text))).toHaveLength(0);
  });
  it("金額と残高が揃っていれば取り込む", () => {
    const text = ["2026年06月", "06/22", "19,760", "20,399", "カ）ビユーカード"].join("\n");
    const t = parseBankText(cleanOcrText(text));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ amount: 19760, balance: 20399 });
  });
});

describe("JRE BANK: 実際のOCR出力から読み取る", () => {
  // 端末で実際に読み取られたテキスト(桁区切りがピリオドになる、小書きカナが大きく出る)
  const text = [
    "17:07 5! 4G 札 9",
    "く入出金明細 XX",
    "取引日入出金 ( 円 ) 残高 (円 )",
    "2026 年 07 月",
    "",
    "07/06 -156.,750 649",
    "カ ) ヒ ユーカート >",
    "07/04 137.000 157.399",
    "ハヤシシュユンヤ >",
    "2026 年 06 月",
    "",
    "06/22 19,760 20.399",
    "カ ) ビュユーカード . >",
    "06/04 -143,560 639",
    "カ ) ヒ ユーカート >",
  ].join("\n");
  const txns = parseBankText(cleanOcrText(text));
  it("桁区切りがピリオドでも金額として読む", () => {
    expect(txns.map((t) => t.amount)).toEqual([-156750, 137000, 19760, -143560]);
  });
  it("日付と残高も正しく読む", () => {
    expect(txns.map((t) => t.date)).toEqual(["2026-07-06", "2026-07-04", "2026-06-22", "2026-06-04"]);
    expect(txns.map((t) => t.balance)).toEqual([649, 157399, 20399, 639]);
  });
  it("小書きカナが大きく読まれてもビューカードとして振り分ける", () => {
    expect(classifyTxn(txns[0].desc, DEFAULT_CONFIG.importRules, txns[0].amount))
      .toMatchObject({ action: "card", target: "VIEW" });
  });
  it("ハヤシ シユンヤは自分名義として扱う", () => {
    expect(matchesOwnName(txns[1].desc, ["ハヤシ シユンヤ"])).toBe(true);
  });
});

describe("既定ルールを増やしたとき既存の設定にも入る", () => {
  it("ビューカードや三井住友のルールが後から足される", () => {
    const before = { accounts: [], salaryItems: [], importRulesSeeded: 2,
      importRules: [{ id: "a", match: "エポス", action: "card", target: "EPOS" }] };
    const rules = migrateConfig(before).importRules as ImportRule[];
    expect(rules.some((r) => r.match === "ビューカード" && r.target === "VIEW")).toBe(true);
    expect(rules.some((r) => r.match === "三井住友" && r.amount === 294 && r.target === "smcc")).toBe(true);
    expect(rules.some((r) => r.match === "エポス")).toBe(true);          // 既存は残る
    expect(migrateConfig(before).importRulesSeeded).toBe(4);
  });
  it("利用者が消したルールは戻さない(版が上がっていれば足さない)", () => {
    const after = { accounts: [], salaryItems: [], importRulesSeeded: 4, importRules: [] };
    expect((migrateConfig(after).importRules as ImportRule[]).length).toBe(0);
  });
  it("濁点が落ちた「ヒユーカート」も引き落としと分かる", () => {
    expect(isDebitDesc("カ ) ヒ ユーカート >")).toBe(true);
  });
});

describe("残高がいつ時点かを持ち、締め日まで届いているかを見る", () => {
  const bal = (ym: string, amount: number, asOf?: string) =>
    ({ ym, cat: "account" as const, item: "残高", account: "A", amount, ...(asOf ? { asOf } : {}) });
  it("締め日まで届いていれば covered", () => {
    // 4月度は 4/11〜5/10。残高が5/10時点なら期間を満たす
    // 締め日が休日なら翌営業日までが同じ周期(2026-05-10は日曜なので5/11まで)
    const end = cycleEndDate("2026-04", 10);
    expect(end).toBe("2026-05-11");
    const r = verifyCycles([bal("2026-03", 100000, "2026-04-10"), bal("2026-04", 100000, end)], 10)
      .find((x) => x.ym === "2026-04")!;
    expect(r.endDate).toBe(end);
    expect(r.covered).toBe(true);
  });
  it("締め日より前の残高なら covered でない(合っていても当てにならない)", () => {
    const r = verifyCycles([bal("2026-03", 100000, "2026-04-10"), bal("2026-04", 100000, "2026-05-05")], 10)
      .find((x) => x.ym === "2026-04")!;
    expect(r.covered).toBe(false);
    expect(r.ok).toBe(true);   // 金額は合うが、5/6〜5/10が抜けている可能性がある
  });
  it("日付が無い残高は covered でない", () => {
    const r = verifyCycles([bal("2026-03", 100000), bal("2026-04", 100000)], 10).find((x) => x.ym === "2026-04")!;
    expect(r.asOf).toBeUndefined();
    expect(r.covered).toBe(false);
  });
});

describe("大文字小文字を区別せずルールに当てる", () => {
  it("全角大文字のＰＡＹＰＡＹカードがルール「Pay」に当たる", () => {
    expect(classifyTxn("自払　ＰＡＹＰＡＹカード", DEFAULT_CONFIG.importRules, -61533))
      .toMatchObject({ action: "card", target: "PayPay" });
  });
  it("三井住友は金額で分ける判定も効いたまま", () => {
    expect(classifyTxn("自払　三井住友カード", DEFAULT_CONFIG.importRules, -294)).toMatchObject({ target: "smcc" });
    expect(classifyTxn("自払　三井住友カード", DEFAULT_CONFIG.importRules, -97724)).toMatchObject({ target: "SMCC Gold" });
  });
});

describe("カードのルールは出金にだけ当てる", () => {
  const src = { action: "account" as const, target: "ゆうちょ" };
  it("出金ならカード請求として扱う", () => {
    expect(classifyTxnForImport("自払　ＰＡＹＰＡＹカード", DEFAULT_CONFIG.importRules, src, -61533))
      .toMatchObject({ action: "card", target: "PayPay" });
  });
  it("入金はカードにしない(返金・チャージの戻しなので口座の入金)", () => {
    expect(classifyTxnForImport("ＰＡＹＰＡＹ", DEFAULT_CONFIG.importRules, src, 5000))
      .toMatchObject({ action: "account", target: "ゆうちょ" });
  });
});

describe("同じ日に複数の取引があるときの期末残高", () => {
  const t = (date: string, amount: number, balance: number) => ({ date, desc: "x", amount, balance });
  it("残高の連なりから、その日の最後の取引を選ぶ(並び順に依存しない)", () => {
    // 5/11に2件。JCB(-120,681→38,728) のあとに ミツビシ(-37,804→924)
    const rows = [t("2026-05-11", -37804, 924), t("2026-05-11", -120681, 38728)];
    expect(cycleEndBalances(rows, 10).get("2026-04")).toEqual({ date: "2026-05-11", balance: 924 });
    // 並びを逆にしても同じ答えになる
    expect(cycleEndBalances([...rows].reverse(), 10).get("2026-04")).toEqual({ date: "2026-05-11", balance: 924 });
  });
  it("月度ごとに分けて返す", () => {
    const rows = [t("2026-05-11", -37804, 924), t("2026-05-12", -1000, 50000)];
    const m = cycleEndBalances(rows, 10);
    expect(m.get("2026-04")!.balance).toBe(924);    // 4月度は5/11まで
    expect(m.get("2026-05")!.balance).toBe(50000);  // 5/12から5月度
  });
  it("残高が無い行は無視する", () => {
    expect(cycleEndBalances([{ date: "2026-05-11", desc: "x", amount: -100 }], 10).size).toBe(0);
  });
});

describe("OCRの読み違いを許す照合", () => {
  const R = DEFAULT_CONFIG.importRules!;

  it("1文字混ざっても長いカード名なら拾う(ビューカード→ヒヘユーカート)", () => {
    // 実際にOCRが出した文字列。「ヒユーカート」に「ヘ」が1文字混ざっている
    expect(classifyTxn("カ ) ヒ ヘユーカート・ (の", R, -33000))
      .toMatchObject({ action: "card", target: "VIEW" });
  });

  it("1文字欠けても拾う", () => {
    expect(classifyTxn("自払 ビューカド", R, -33000)).toMatchObject({ action: "card", target: "VIEW" });
    expect(classifyTxn("自払 ハイフリツ", R, -50000)).toMatchObject({ action: "account", negItem: "投資振替" });
  });

  it("完全一致が、あいまい一致より先に使われる", () => {
    // 「ミツイスミトモ」は「ミツヒシ」から遠いが、順番が入れ替わらないことも併せて確かめる
    expect(classifyTxn("自払 ミツビシUFJニコス", R, -1000)).toMatchObject({ target: "MDC" });
    // 額の条件つきルール(294=smcc)は完全一致の段階で先に当たる
    expect(classifyTxn("自払 三井住友カード", R, -294)).toMatchObject({ target: "smcc" });
    expect(classifyTxn("自払 三井住友カード", R, -97724)).toMatchObject({ target: "SMCC Gold" });
  });

  it("短い語は緩めない(別のカード・別の口座に誤爆するため)", () => {
    expect(fuzzyIncludes("せそん", "セソン")).toBe(false);   // セゾン(3文字)
    expect(fuzzyIncludes("ことり", "ことら")).toBe(false);   // ことら(3文字)
    expect(fuzzyIncludes("atn", "atm")).toBe(false);         // ATM(3文字)
    // 短い語の完全一致は、あいまい照合の手前(完全一致の段階)で拾われる
    expect(classifyTxn("口座振替 エポスカード", R, -1000)).toMatchObject({ target: "EPOS" });
    expect(classifyTxn("ことり銀行", R, -1000)).toBeNull();
    expect(classifyTxn("エホヌビル管理費", R, -1000)).toBeNull();
  });

  it("4文字までは緩めない(三井住友・ミツビシ)", () => {
    expect(fuzzyIncludes("みつひこ", "みつひし")).toBe(false);
    expect(fuzzyIncludes("三井不動産", "三井住友")).toBe(false);
  });

  it("差が大きすぎるものは拾わない", () => {
    expect(fuzzyIncludes("ヒユーテイーヒー", "ヒユーカート")).toBe(false);
    expect(classifyTxn("ソウダイセイキヨウ", R, -3000)).toBeNull();
  });

  it("あいまい一致でも入金はカード請求にしない", () => {
    const src = { action: "account" as const, target: "ゆうちょ" };
    expect(classifyTxnForImport("カ ) ヒ ヘユーカート・ (の", R, src, 33000))
      .toMatchObject({ action: "account", target: "ゆうちょ" });
  });
});

describe("OCRが金額を数字以外の文字として読んだとき", () => {
  // 実機のスクショ(ゆうちょ)。「-¥7,755」が「-\ フ 755」と読まれ、
  // 金額が拾えず次行の残高¥154,588を金額(入金)にしていた
  const text = [
    "2026.05.07", "自払　セゾ　ン", "- ¥ 717", "¥ 153,871",
    "2026.05.07", "自払　セソ　ン -\\ フ 755", "¥ 154,588",
    "2026.05.07", "自払　セゾ　ン", "- ¥ 10,000", "¥ 162,343",
  ].join("\n");

  it("形の似た文字を数字として読み直す(フ→7)", () => {
    const r = parseBankText(text);
    expect(r).toHaveLength(3);
    expect(r[1]).toMatchObject({ date: "2026-05-07", amount: -7755, balance: 154588 });
    expect(r[1].desc).toContain("セソ");   // 摘要は元の文字のまま(数字に化けない)
  });

  it("正しく読めた行はそのまま", () => {
    const r = parseBankText(text);
    expect(r[0]).toMatchObject({ amount: -717, balance: 153871 });
    expect(r[2]).toMatchObject({ amount: -10000, balance: 162343 });
  });

  it("摘要の「フ」は数字にしない", () => {
    const r = parseBankText("2026.05.08\n送金　ニツポ　ンユウセイフ　ドウ\n¥ 2,198\n¥ 156,069");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ amount: 2198, balance: 156069 });
    expect(r[0].desc).toContain("ユウセイフ");
  });
});

describe("残高の連なりから金額を復元する", () => {
  const t = (amount: number, balance?: number) => ({ date: "2026-05-07", desc: "x", amount, ...(balance == null ? {} : { balance }) });

  it("新しい順の明細で、残高を金額に取り違えた行を直す", () => {
    // 162,343 →(-7,755)→ 154,588 →(-717)→ 153,871
    const rows = [t(-717, 153871), t(154588), t(-10000, 162343)];
    expect(repairAmountsFromBalances(rows)[1]).toEqual({ date: "2026-05-07", desc: "x", amount: -7755, balance: 154588 });
  });

  it("古い順の明細でも直す", () => {
    const rows = [t(-10000, 162343), t(154588), t(-717, 153871)];
    expect(repairAmountsFromBalances(rows)[1]).toMatchObject({ amount: -7755, balance: 154588 });
  });

  it("検算が合わない行には触らない", () => {
    const rows = [t(-717, 153871), t(99999), t(-10000, 162343)];
    expect(repairAmountsFromBalances(rows)[1]).toEqual(t(99999));
  });

  it("隣の残高が無ければ触らない", () => {
    const rows = [t(-717), t(154588), t(-10000, 162343)];
    expect(repairAmountsFromBalances(rows)[1]).toEqual(t(154588));
  });

  it("端の行には触らない(隣が片方しか無い)", () => {
    const rows = [t(154588), t(-10000, 162343)];
    expect(repairAmountsFromBalances(rows)[0]).toEqual(t(154588));
  });
});

describe("摘要に頼らない重複の目印", () => {
  type Sig = Parameters<typeof entrySignature>[0];
  const e = (o: Partial<Sig>): Sig => ({ ym: "2026-04", cat: "account", item: "投資振替", account: "NEOBANK", amount: -50000, ...o });

  it("摘要が違っても、中身が同じなら同じ目印になる", () => {
    // CSVとスクショで摘要の読み取り方が違っても同じ取引と分かる
    expect(entrySignature(e({}))).toBe(entrySignature(e({})));
  });

  it("月度・種類・項目・口座・金額のどれかが違えば別の目印", () => {
    const base = entrySignature(e({}));
    expect(entrySignature(e({ ym: "2026-05" }))).not.toBe(base);
    expect(entrySignature(e({ cat: "card" }))).not.toBe(base);
    expect(entrySignature(e({ item: "出金" }))).not.toBe(base);
    expect(entrySignature(e({ account: "ゆうちょ" }))).not.toBe(base);
    expect(entrySignature(e({ amount: -50001 }))).not.toBe(base);
    expect(entrySignature(e({ amount: 50000 }))).not.toBe(base); // 符号が逆なら別物(振替の相手側)
  });

  it("口座を持たない記録(カード・給与)も数えられる", () => {
    const card = { ym: "2026-04", cat: "card" as const, item: "SAISON", amount: -7755 };
    expect(entrySignature(card)).toBe(entrySignature({ ...card, account: undefined }));
  });

  it("同じ内容が何件あるかを数える", () => {
    const m = countBySignature([e({}), e({}), e({ amount: -1000 })]);
    expect(m.get(entrySignature(e({})))).toBe(2);
    expect(m.get(entrySignature(e({ amount: -1000 })))).toBe(1);
    expect(m.get(entrySignature(e({ amount: -9999 })))).toBeUndefined();
  });
});

describe("摘要がその語だけのときに当たるルール", () => {
  const R = DEFAULT_CONFIG.importRules!;

  it("ゆうちょの「カード」はキャッシュカードのATM取引(口座の引出/預入)", () => {
    // クレジットカードの請求ではないので、カード請求として数えない
    expect(classifyTxn("カード", R, -6000)).toMatchObject({ action: "account", negItem: "引出", posItem: "預入" });
    expect(classifyTxn("カード", R, 6000)).toMatchObject({ action: "account", posItem: "預入" });
  });

  it("カード名を伴う引き落としは、これまでどおりカード請求", () => {
    expect(classifyTxn("自払　三井住友カード", R, -66065)).toMatchObject({ action: "card", target: "SMCC Gold" });
    expect(classifyTxn("自払　三井住友カード", R, -294)).toMatchObject({ action: "card", target: "smcc" });
    expect(classifyTxn("自払　ビューカード", R, -33000)).toMatchObject({ action: "card", target: "VIEW" });
  });

  it("取込元の口座へ振り分ける(ルール側の口座指定は空でよい)", () => {
    const src = { action: "account" as const, target: "ゆうちょ" };
    expect(classifyTxnForImport("カード", R, src, -6000))
      .toMatchObject({ action: "account", target: "ゆうちょ", negItem: "引出" });
  });

  it("語だけのルールは、前後に文字が付くと当たらない", () => {
    const rules: ImportRule[] = [{ id: "1", match: "カード", action: "account", negItem: "引出", posItem: "預入", exact: true }];
    expect(classifyTxn("カード", rules, -1000)).toMatchObject({ negItem: "引出" });
    expect(classifyTxn("カードローン返済", rules, -1000)).toBeNull();
    expect(classifyTxn("自払 エヌカード", rules, -1000)).toBeNull();
  });

  it("OCRの空白・濁点のゆれは吸収する", () => {
    expect(classifyTxn("カ ー ド", R, -6000)).toMatchObject({ negItem: "引出" });
    expect(classifyTxn("カート", R, -6000)).toMatchObject({ negItem: "引出" });
  });
});

describe("「カード」ルールの追加(版4)", () => {
  it("既存の設定にも一度だけ足される", () => {
    const before = { accounts: [], salaryItems: [], importRulesSeeded: 3,
      importRules: [{ id: "a", match: "エポス", action: "card", target: "EPOS" }] };
    const after = migrateConfig(before);
    const rules = after.importRules as ImportRule[];
    expect(rules.filter((r) => r.match === "カード" && r.exact)).toHaveLength(1);
    expect(after.importRulesSeeded).toBe(4);
    // 版3で消した他の既定ルールまでは戻さない
    expect(rules.some((r) => r.match === "ビューカード")).toBe(false);
    expect(rules).toHaveLength(2);
  });

  it("消したあとに読み込み直しても復活しない", () => {
    const before = { accounts: [], salaryItems: [], importRulesSeeded: 3, importRules: [] };
    const removed = { ...migrateConfig(before), importRules: [] };
    expect((migrateConfig(removed).importRules as ImportRule[])).toHaveLength(0);
  });
});

describe("残高が締め日まで届いているか", () => {
  const t = (date: string, amount: number, balance?: number) => ({ date, desc: "x", amount, ...(balance == null ? {} : { balance }) });

  it("明細が締め日より後まで続いていれば、締め日時点の残高として扱う", () => {
    // 10日締め → 5月度は 5/11〜6/10。6/11の取引があるので、6/04の残高が6/10時点の残高
    const rows = [t("2026-06-11", 6000, 7085), t("2026-06-04", -70642, 1085)];
    expect(cycleEndBalances(rows, 10).get("2026-05")).toEqual({ date: "2026-06-10", balance: 1085 });
  });

  it("締め日まで届いていなければ、最後の取引日時点の残高", () => {
    // 5月の明細だけ(5/31まで)。6/1〜6/10の取引は分からない
    const rows = [t("2026-05-31", -6000, 234355), t("2026-05-27", 1600, 240355)];
    expect(cycleEndBalances(rows, 10).get("2026-05")).toEqual({ date: "2026-05-31", balance: 234355 });
  });

  it("残高の無い取引でも、明細が続いている証拠になる", () => {
    const rows = [t("2026-06-11", 6000), t("2026-06-04", -70642, 1085)];
    expect(cycleEndBalances(rows, 10).get("2026-05")!.date).toBe("2026-06-10");
  });

  it("届いていない残高は画面で断れる", () => {
    expect(balanceReachesCycleEnd({ ym: "2026-05", asOf: "2026-05-31" }, 10)).toBe(false);
    expect(balanceReachesCycleEnd({ ym: "2026-05", asOf: "2026-06-10" }, 10)).toBe(true);
    // 手入力した残高(asOfなし)は月末残高のつもりなので断らない
    expect(balanceReachesCycleEnd({ ym: "2026-05" }, 10)).toBe(true);
  });

  it("残高がいつ時点かを引き継ぐ", () => {
    const entries = [{ id: "1", ym: "2026-05", cat: "account" as const, item: "残高", account: "ゆうちょ", amount: 234355, asOf: "2026-05-31" }];
    expect(balancesAsOf(entries, "2026-06")["ゆうちょ"]).toEqual({ amount: 234355, ym: "2026-05", asOf: "2026-05-31" });
  });
});

describe("残高の置き換え(取り込む順番)", () => {
  // 10日締め。5月度は5/11〜6/10なので、締め日まで届いた残高は6月の明細から得られる
  const partial = { ym: "2026-05", asOf: "2026-05-31" };   // 5月の明細だけ
  const full = { ym: "2026-05", asOf: "2026-06-10" };      // 6月の明細まで

  it("5月→6月の順: 締め日まで届いた残高で置き換える", () => {
    expect(shouldReplaceBalance(partial, full, 10)).toBe(true);
  });

  it("6月→5月の順: 届いた残高を、届いていない残高で塗り潰さない", () => {
    expect(shouldReplaceBalance(full, partial, 10)).toBe(false);
  });

  it("どちらも届いていなければ、より新しい時点のものを採る", () => {
    expect(shouldReplaceBalance({ ym: "2026-05", asOf: "2026-05-31" }, { ym: "2026-05", asOf: "2026-06-04" }, 10)).toBe(true);
    expect(shouldReplaceBalance({ ym: "2026-05", asOf: "2026-06-04" }, { ym: "2026-05", asOf: "2026-05-31" }, 10)).toBe(false);
  });

  it("同じ時点なら取り込んだ方で上書きする(取り込み直しが効く)", () => {
    expect(shouldReplaceBalance(full, { ym: "2026-05", asOf: "2026-06-10" }, 10)).toBe(true);
  });

  it("記録が無ければそのまま入れる。手入力の残高(asOfなし)は月末残高として扱う", () => {
    expect(shouldReplaceBalance(null, partial, 10)).toBe(true);
    expect(shouldReplaceBalance({ ym: "2026-05" }, partial, 10)).toBe(false);  // 手入力を部分残高で消さない
    expect(shouldReplaceBalance(partial, { ym: "2026-05" }, 10)).toBe(true);
  });
});

describe("残高が合わないときの原因候補", () => {
  const e = (o: any) => ({ id: o.id || "x", ym: "2026-05", cat: "account" as const, item: "出金", account: "ゆうちょ", amount: -1000, ...o });

  it("差額と同じ額の記録は「二重」か「取りこぼし」", () => {
    const rows = [e({ id: "a", amount: -7755 }), e({ id: "b", amount: -1000 })];
    // 実際の残高が計算より7,755多い → この出金が二重に入っている
    expect(explainCycleGap(rows, 7755)).toEqual([{ kind: "dup", entry: rows[0] }]);
    // 実際の残高が計算より7,755少ない → 同じ出金がもう1件あるはず
    expect(explainCycleGap(rows, -7755)).toEqual([{ kind: "missing", entry: rows[0] }]);
  });

  it("差額が記録の2倍なら符号違い(OCRがマイナスを読み落とした)", () => {
    // +7,755と読まれたが本当は-7,755。増減が15,510多いので、残高は15,510少なく見える
    const rows = [e({ id: "a", amount: 7755 })];
    expect(explainCycleGap(rows, -15510)).toEqual([{ kind: "sign", entry: rows[0] }]);
  });

  it("残高の記録そのものは増減ではないので候補に入れない", () => {
    const rows = [e({ id: "a", item: "残高", amount: -7755 })];
    expect(explainCycleGap(rows, 7755)).toEqual([]);
  });

  it("合っているとき・候補が無いときは何も挙げない", () => {
    const rows = [e({ amount: -1000 })];
    expect(explainCycleGap(rows, 0)).toEqual([]);
    expect(explainCycleGap(rows, null)).toEqual([]);
    expect(explainCycleGap(rows, 12345)).toEqual([]);
  });

  it("どちら向きにずれているかを言葉で示す", () => {
    expect(cycleGapDirection(500)).toContain("入金の記録が抜けている");
    expect(cycleGapDirection(-500)).toContain("出金の記録が抜けている");
    expect(cycleGapDirection(0)).toBe("");
  });
});

describe("二重に入っている記録を探す", () => {
  const e = (o: any) => ({ ym: "2026-06", cat: "account" as const, item: "投資振替", account: "NEOBANK", amount: 20000, ...o });

  it("同じ内容の記録をまとめ、1件だけ残す候補を返す", () => {
    const rows = [e({ id: "a" }), e({ id: "b" }), e({ id: "c", amount: -20000 })];
    const g = findDuplicateEntries(rows);
    expect(g).toHaveLength(1);
    expect(g[0].keepId).toBe("a");
    expect(g[0].removeIds).toEqual(["b"]);
  });

  it("同じ明細の行から取り込んだものは「確実」", () => {
    const src = "2026-06-05|20000|ハイフリツト";
    expect(findDuplicateEntries([e({ id: "a", src }), e({ id: "b", src })])[0]).toMatchObject({ certain: true, removeIds: ["b"] });
    // 摘要違い(CSVとスクショ)は同じ内容だが、同じ額の取引が2件ある可能性も残る
    expect(findDuplicateEntries([e({ id: "a", src }), e({ id: "b", src: "2026-06-05|20000|sbi" })])[0].certain).toBe(false);
  });

  it("確実な分だけを「確実」にする(残りは要確認に分ける)", () => {
    // 同じ日に、同じ明細の行が2件 + 摘要違いが1件。確実に消せるのは1件だけ
    const src = "2026-06-15|20000|ハイフリツト";
    const rows = [e({ id: "a", src }), e({ id: "b", src }), e({ id: "c", src: "2026-06-15|20000|sbi" })];
    const g = findDuplicateEntries(rows);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ certain: true, keepId: "a", removeIds: ["b"] });
    expect(g[1]).toMatchObject({ certain: false, keepId: "a", removeIds: ["c"] });
  });

  it("符号が逆なら別物(振替の相手側を消さない)", () => {
    expect(findDuplicateEntries([e({ id: "a" }), e({ id: "b", amount: -20000 })])).toEqual([]);
  });

  it("口座や項目が違えば別物", () => {
    expect(findDuplicateEntries([e({ id: "a" }), e({ id: "b", account: "ゆうちょ" })])).toEqual([]);
    expect(findDuplicateEntries([e({ id: "a" }), e({ id: "b", item: "口座振替" })])).toEqual([]);
  });

  it("残高は対象外(月度・口座で1件に保たれている)", () => {
    expect(findDuplicateEntries([e({ id: "a", item: "残高" }), e({ id: "b", item: "残高" })])).toEqual([]);
  });

  it("確実なものを先に並べる", () => {
    const src = "2026-06-05|500|x";
    const rows = [
      e({ id: "a", amount: 90000 }), e({ id: "b", amount: 90000 }),          // 指紋なし・要確認
      e({ id: "c", amount: 500, item: "出金", src }), e({ id: "d", amount: 500, item: "出金", src }),
    ];
    const g = findDuplicateEntries(rows);
    expect(g[0]).toMatchObject({ certain: true, removeIds: ["d"] });
    expect(g.map((x) => x.certain)).toEqual([true, false]);
  });
});

describe("重複の判定は日付まで見る", () => {
  const e = (o: any) => ({ ym: "2026-06", cat: "account" as const, item: "投資振替", account: "NEOBANK", amount: 20000, ...o });

  it("同じ月でも日が違えば別の取引(重複にしない)", () => {
    const rows = [e({ id: "a", src: "2026-06-15|20000|ハイフリツト" }), e({ id: "b", src: "2026-06-20|20000|ハイフリツト" })];
    expect(findDuplicateEntries(rows)).toEqual([]);
  });

  it("同じ日・同じ額なら重複を疑う", () => {
    const rows = [e({ id: "a", src: "2026-06-15|20000|ハイフリツト" }), e({ id: "b", src: "2026-06-15|20000|sbiハイフリツト" })];
    const g = findDuplicateEntries(rows);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ certain: false, keepId: "a", removeIds: ["b"] });
  });

  it("日付を持たない記録(手入力)どうしは月度でまとめる", () => {
    const rows = [e({ id: "a" }), e({ id: "b" })];
    expect(findDuplicateEntries(rows)[0]).toMatchObject({ keepId: "a", removeIds: ["b"] });
  });

  it("日付のある記録と、日付の無い記録は分けて数える", () => {
    const dated = e({ id: "a", src: "2026-06-15|20000|x" });
    const m = countBySignature([dated, e({ id: "b" })]);
    expect(m.get(entryDaySignature(dated)!)).toBe(1);
    expect(m.get(entrySignature(e({})))).toBe(1);
  });

  it("日付が読めない指紋は月度あつかいにする", () => {
    expect(entryDaySignature(e({ src: "こわれた指紋" }))).toBeNull();
    expect(entryDate(e({ src: "2026-06-15|20000|x" }))).toBe("2026-06-15");
  });
});

describe("同じ取込の中の同じ内容は別の取引", () => {
  // 実例(NEOBANK 2026-06-23): SBIハイブリッド預金振替 -20,000 が同じ日に2回
  const e = (o: any) => ({ ym: "2026-06", cat: "account" as const, item: "投資振替", account: "NEOBANK",
    amount: -20000, src: "2026-06-23|-20000|sbiハイフリツト預金振替", ...o });

  it("1つのCSVに2行あったものは重複にしない", () => {
    const rows = [e({ id: "a", imp: "csv1" }), e({ id: "b", imp: "csv1" })];
    expect(findDuplicateEntries(rows)).toEqual([]);
  });

  it("同じCSVを2回取り込んだら、その取込ぶんを丸ごと消す候補にする", () => {
    const rows = [e({ id: "a", imp: "csv1" }), e({ id: "b", imp: "csv1" }),
                  e({ id: "c", imp: "csv2" }), e({ id: "d", imp: "csv2" })];
    const g = findDuplicateEntries(rows);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ certain: true, keepId: "a" });
    expect(g[0].removeIds.sort()).toEqual(["c", "d"]);
  });

  it("片方の取込にしか無い分は、多い方を本来の件数とみなす", () => {
    // csv1が2件、スクショが1件しか読めなかった → 本来2件。スクショの1件が余分
    const rows = [e({ id: "a", imp: "csv1" }), e({ id: "b", imp: "csv1" }), e({ id: "c", imp: "shot" })];
    expect(findDuplicateEntries(rows)[0]).toMatchObject({ keepId: "a", removeIds: ["c"] });
  });

  it("取込の印が無い記録は1件ずつ別の取込とみなす(印を付ける前のデータ)", () => {
    const rows = [e({ id: "a" }), e({ id: "b" })];
    expect(findDuplicateEntries(rows)[0]).toMatchObject({ keepId: "a", removeIds: ["b"] });
  });

  it("摘要が違えば「要確認」にする(同じ行とは言い切れない)", () => {
    const rows = [e({ id: "a", imp: "csv1" }), e({ id: "b", imp: "shot", src: "2026-06-23|-20000|ハイフリツト" })];
    expect(findDuplicateEntries(rows)[0]).toMatchObject({ certain: false, removeIds: ["b"] });
  });
});

describe("同じ日の始めと終わりの残高が同じとき", () => {
  const t = (date: string, amount: number, balance: number) => ({ date, desc: "x", amount, balance });

  it("残高の連なりが輪になっても、明細の向きで最後の行を採る(新しい順)", () => {
    // 実例(NEOBANK 7/24): 2,253 →+80,000→ 82,253 →-60,000→ 22,253 →-20,000→ 2,253
    // 日の始めと終わりが同じ2,253なので、どの行も他の行の「ひとつ前」に見える
    const rows = [
      t("2026-07-24", -20000, 2253), t("2026-07-24", -60000, 22253), t("2026-07-24", 80000, 82253),
      t("2026-07-21", -2000, 2253),
    ];
    expect(cycleEndBalances(rows, 10).get("2026-07")).toEqual({ date: "2026-07-24", balance: 2253 });
  });

  it("古い順に並ぶ明細でも同じ答えになる", () => {
    const rows = [
      t("2026-07-21", -2000, 2253),
      t("2026-07-24", 80000, 82253), t("2026-07-24", -60000, 22253), t("2026-07-24", -20000, 2253),
    ];
    expect(cycleEndBalances(rows, 10).get("2026-07")!.balance).toBe(2253);
  });

  it("連なりで決まるときは、これまでどおり並び順に依らない", () => {
    const rows = [t("2026-05-11", -37804, 924), t("2026-05-11", -120681, 38728)];
    expect(cycleEndBalances(rows, 10).get("2026-04")!.balance).toBe(924);
    expect(cycleEndBalances([...rows].reverse(), 10).get("2026-04")!.balance).toBe(924);
  });
});
