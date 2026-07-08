import { describe, it, expect } from "vitest";
import {
  yen, num, addMonth, ymLabel,
  migrateEntry, migrateConfig, acctRole, flowTypesFor, computeSummary,
  planMonths, fyStartOf, planValue, actualForLine, hasActualForLine,
  hasBalRecord, balTotalOf, planLines, planGroupSign, DEFAULT_CONFIG,
  planVsActualForMonth, advanceRenewalDate, rollForwardSubs,
  isMonthClosed, toggleMonthClosed,
} from "./utils.js";

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
    expect(acctRole("送金")).toBe("out");
    expect(acctRole("投資振替")).toBe("transfer");
  });
  it("旧称「受取」も収入として後方互換", () => expect(acctRole("受取")).toBe("in"));
  it("flowTypesFor: 設定があればそれ、無ければ全種類", () => {
    expect(flowTypesFor("ゆうちょ", DEFAULT_CONFIG)).toEqual(["預入", "入金", "引出", "送金"]);
    expect(flowTypesFor("未知の口座", DEFAULT_CONFIG)).toEqual(["預入", "入金", "引出", "送金", "投資振替"]);
  });
});

describe("migrateEntry", () => {
  it("新形式はそのまま(idを補完)", () => {
    const e = migrateEntry({ ym: "2026-06", cat: "card", item: "VIEW", amount: 100 });
    expect(e.cat).toBe("card");
    expect(e.id).toBeTruthy();
  });
  it("口座の「受取」は「入金」へ改称", () => {
    const e = migrateEntry({ ym: "2026-06", cat: "account", item: "受取", account: "ゆうちょ", amount: 500 });
    expect(e.item).toBe("入金");
    expect(e.amount).toBe(500);
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
    expect(migrateEntry({ ym: "2026-05", kind: "transfer", amount: 100 }).item).toBe("入金");
    expect(migrateEntry({ ym: "2026-05", kind: "transfer", amount: -100 }).item).toBe("引出");
  });
  it("壊れたデータはnull(落とさない)", () => {
    expect(migrateEntry(null)).toBeNull();
    expect(migrateEntry({ ym: "2026-05", kind: "謎" })).toBeNull();
  });
});

describe("migrateConfig", () => {
  it("accountFlowsの「受取」を「入金」へ", () => {
    const c = migrateConfig({ accountFlows: { "ゆうちょ": ["預入", "受取"], "JRE BANK": ["受取", "送金"] } });
    expect(c.accountFlows["ゆうちょ"]).toEqual(["預入", "入金"]);
    expect(c.accountFlows["JRE BANK"]).toEqual(["入金", "送金"]);
  });
  it("accountFlowsが無ければそのまま", () => {
    const c = { accounts: ["A"] };
    expect(migrateConfig(c)).toBe(c);
  });
});

describe("computeSummary", () => {
  const entries = [
    { cat: "salary", item: "給与", amount: 300000 },
    { cat: "salary", item: "控除", amount: -50000 },
    { cat: "card", item: "VIEW", amount: 40000 },
    { cat: "account", item: "入金", account: "A", amount: 10000 },
    { cat: "account", item: "引出", account: "A", amount: -20000 },
    { cat: "account", item: "投資振替", account: "B", amount: -30000 },
    { cat: "account", item: "残高", account: "A", amount: 111111 },
    { cat: "account", item: "残高", account: "B", amount: 222222 },
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
    const lines = planLines(DEFAULT_CONFIG, [{ name: "VIEW" }]);
    const acct = lines.filter((l) => l.group === "account").map((l) => l.label);
    expect(acct).toEqual(["預入", "入金", "引出", "送金", "投資振替"]);
    expect(lines.some((l) => l.key === "card|VIEW" && l.group === "card")).toBe(true);
    expect(planGroupSign("card")).toBe(-1);
    expect(planGroupSign("salary")).toBe(1);
    expect(planGroupSign("account")).toBe(1);
  });

  const month = [
    { ym: "2026-06", cat: "salary", item: "給与", amount: 286720 },
    { ym: "2026-06", cat: "card", item: "VIEW", amount: 40000 },
    { ym: "2026-06", cat: "account", item: "投資振替", account: "B", amount: -94000 },
    { ym: "2026-06", cat: "account", item: "残高", account: "A", amount: 155596 },
  ];
  const memos = [{ category: "交際費", ym: "2026-06", amount: 12000 }, { category: "交際費", ym: "2026-05", amount: 9999 }];
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
  it("残高記録の検出と合計", () => {
    expect(hasBalRecord(month)).toBe(true);
    expect(balTotalOf(month)).toBe(155596);
    expect(hasBalRecord([])).toBe(false);
  });

  it("planVsActualForMonth: 実績合計/計画合計/差を算出", () => {
    const cards = [{ name: "VIEW" }];
    const config = { salaryItems: ["給与"] };
    const plans = { lines: { "salary|給与": { std: 300000, over: {} }, "card|VIEW": { std: 40000, over: {} } } };
    const monthEntries = [
      { cat: "salary", item: "給与", amount: 310000 },
      { cat: "card", item: "VIEW", amount: 35000 },
    ];
    const r = planVsActualForMonth(plans, config, cards, [], monthEntries, "2026-06");
    expect(r.planNet).toBe(300000 - 40000);
    expect(r.actualNet).toBe(310000 - 35000);
    expect(r.diff).toBe(r.actualNet - r.planNet);
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
    const subs = [{ id: "1", renewal: "2026-01-15", cycle: "monthly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r[0].renewal >= "2026-06-10").toBe(true);
    // 月額なので15日を維持したまま繰り越されるはず
    expect(r[0].renewal).toBe("2026-06-15");
  });
  it("rollForwardSubs: 今日以降ならそのまま(参照も同じ)", () => {
    const subs = [{ id: "1", renewal: "2026-12-01", cycle: "monthly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r).toBe(subs);
  });
  it("rollForwardSubs: 更新日なしのサブスクは無視", () => {
    const subs = [{ id: "1", renewal: "", cycle: "monthly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r).toBe(subs);
  });
  it("rollForwardSubs: 年払いも正しく繰り越す", () => {
    const subs = [{ id: "1", renewal: "2024-03-01", cycle: "yearly" }];
    const r = rollForwardSubs(subs, "2026-06-10");
    expect(r[0].renewal).toBe("2027-03-01");
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
