import { describe, expect, it } from "vitest";
import {
  addContractDays, addContractMonths, contractDateFromCell, contractMilestones,
  findExistingContract, isImportableSubscriptionAmount, mergeContractImports, mergeSubscriptionImports, normalizeContracts,
  parseContractWorkbook, planSubscriptionImport, unlinkMissingSubscriptions,
  type Contract, type SubscriptionCandidate, type WorkbookSheets,
} from "./contracts";
import type { Sub } from "./utils";

// 架空の契約のみ。実際の電話番号・契約番号・添付ファイルの個人情報は置かない。
function workbookFixture(): WorkbookSheets {
  const lines: unknown[][] = [[], ["端末", "概要", "電話番号", "キャリア"]];
  for (let index = 0; index < 11; index++) {
    lines.push(["Test Phone", index < 8 ? "サブ" : "特典", `0000000${String(index + 1).padStart(4, "0")}`, `Carrier ${index + 1}`, "Test plan", "2GB", index === 0 ? 0 : index === 1 ? undefined : 300, index === 2 ? 0 : "通話オプション", "記録上の通話料", index === 1 ? undefined : "2024-01-31", undefined, index === 8 ? 1000 : undefined, index === 8 ? "2024-07-01" : undefined, "Card as written", 0.01, "特典の説明"]);
  }
  const old: unknown[][] = [[], [], ["Old Phone", "サブ", "00000000001", "Old Carrier", "Old Plan", "1GB", 600, undefined, "2023-01-01"]];
  old.push([...old[2]]); // 旧台帳の重複も履歴は一つだけ。
  old.push(["Old Phone", "サブ", "00000009999", "Old-only Carrier", "Old Plan", "1GB", 800, undefined, "2022-01-01"]);
  const devices: unknown[][] = [[], [undefined, undefined, "契約機種番号", "キャリア", "機種"]];
  devices.push([undefined, undefined, "00000000111", "Carrier A", "Watch Alpha", 10, 100, 2640, "2024-01-31", undefined, undefined, "Device Card"]);
  devices.push([undefined, undefined, undefined, "Carrier B", "Phone Beta", 1, undefined, undefined, "2024-02-29"]);
  devices.push([undefined, undefined, "00000000222", "Carrier A", "Tablet Gamma", 20, 200, 5280, "2025-05-30"]);
  devices.push([undefined, undefined, undefined, "Carrier C", "Phone Delta", 700, 700, 25200, undefined, undefined, undefined, undefined, undefined, "36回払い"]);
  const subscriptions: unknown[][] = [[], [undefined, "年間"]];
  for (let index = 0; index < 2; index++) subscriptions.push([undefined, undefined, `Year Service ${index}`, "学割", "2024-02-29", "2025-02-28", 1200, "STATEMENT NAME", undefined, "Original Card"]);
  subscriptions.push([], [undefined, "月間", "項目"]);
  for (let index = 0; index < 13; index++) subscriptions.push([undefined, undefined, `Month Service ${index}`, undefined, index === 0 ? undefined : 5, "2024-03-05", index === 1 ? 0 : index === 2 ? undefined : 200, "STATEMENT NAME", "Billing platform", "Original Card"]);
  return { "202604": lines, "Sheet1 (2)": old, Device: devices, subscription: subscriptions };
}

const line = (extra: Partial<Contract> = {}): Contract => ({ id: "manual-line", name: "Test line", kind: "line", status: "review", ...extra });
const sub = (extra: Partial<Sub> = {}): Sub => ({ id: "existing-sub", name: "Service", amount: 1234, cycle: "monthly", ...extra });
function candidate(name: string, extra: Partial<Sub> = {}): SubscriptionCandidate {
  return { id: `candidate-${name}`, sourceKey: `source-${name}`, sourceSheet: "subscription", sourceRow: 8, reviewStatus: "review", sub: sub({ id: `imported-${name}`, name, amount: 456, ...extra }) };
}

describe("契約の日付", () => {
  it("180日を暦日で加算し、うるう日・年境界を越える", () => {
    expect(addContractDays("2024-02-29", 180)).toBe("2024-08-27");
    expect(addContractDays("2023-09-01", 180)).toBe("2024-02-28");
    expect(addContractDays("2024-12-31", 1)).toBe("2025-01-01");
  });

  it("13/25か月後は元の日を保ち、存在しない日は月末へ丸める", () => {
    expect(addContractMonths("2024-01-31", 13)).toBe("2025-02-28");
    expect(addContractMonths("2023-01-31", 13)).toBe("2024-02-29");
    expect(addContractMonths("2024-01-31", 25)).toBe("2026-02-28");
    expect(addContractMonths("2024-03-31", -1)).toBe("2024-02-29");
  });

  it("不明日や不正日を補完せず、Excelの実在しない1900/2/29も拒否する", () => {
    expect(addContractDays(undefined, 180)).toBeUndefined();
    expect(addContractMonths("", 13)).toBeUndefined();
    expect(addContractDays("2024-02-30", 180)).toBeUndefined();
    expect(contractDateFromCell(0)).toBeUndefined();
    expect(contractDateFromCell(60)).toBeUndefined();
    expect(contractDateFromCell(1)).toBe("1900-01-01");
    expect(contractDateFromCell(61)).toBe("1900-03-01");
    expect(contractDateFromCell("2024/2/29")).toBe("2024-02-29");
  });

  it("開始日変更は目安日に反映し、返却・解約可能とは判定しない", () => {
    expect(contractMilestones(line({ startDate: "2024-02-29", recordedDay180: "2020-01-01" }))).toEqual({ day180: "2024-08-27" });
    expect(contractMilestones(line({ kind: "device", startDate: "2024-01-31" }))).toEqual({ month13: "2025-02-28", month25: "2026-02-28" });
    expect(contractMilestones(line({ kind: "device" }))).toEqual({ month13: undefined, month25: undefined });
  });
});

describe("チェックシートの読み取り", () => {
  it("現回線11・端末4・サブスク15を分け、旧回線を二重計上しない", () => {
    const parsed = parseContractWorkbook(workbookFixture());
    expect(parsed.contracts.filter((item) => item.kind === "line")).toHaveLength(11);
    expect(parsed.contracts.filter((item) => item.kind === "device")).toHaveLength(4);
    expect(parsed.subscriptions).toHaveLength(15);
    expect(parsed.contracts.every((item) => item.status === "review" && item.linkedSubId === undefined)).toBe(true);
    expect(parsed.subscriptions.every((item) => item.reviewStatus === "review")).toBe(true);
    expect(parsed.contracts[0].history).toHaveLength(1);
    expect(parsed.contracts[0].history?.[0]).toMatchObject({ carrier: "Old Carrier", startDate: "2023-01-01" });
    expect(parsed.contracts.some((item) => item.phone === "00000009999")).toBe(false);
  });

  it("0円と不明額を区別し、先頭0の番号と未記入の開始日を保持する", () => {
    const parsed = parseContractWorkbook(workbookFixture());
    expect(parsed.contracts[0]).toMatchObject({ phone: "00000000001", monthlyAmount: 0 });
    expect(parsed.contracts[1].monthlyAmount).toBeUndefined();
    expect(parsed.contracts[1].startDate).toBeUndefined();
    expect(parsed.contracts[2].optionAmount).toBe(0);
    expect(parsed.contracts[11].contractNumber).toBe("00000000111");
    expect(parsed.subscriptions[3].sub.amount).toBe(0);
    expect(parsed.subscriptions[4].sub.amount).toBe("");
  });

  it("端末の後半料金の開始時期や24+24回払いは推定しない", () => {
    const devices = parseContractWorkbook(workbookFixture()).contracts.filter((item) => item.kind === "device");
    expect(devices[0]).toMatchObject({ monthlyAmount: 10, monthlyAmountLater: 100, totalAmount: 2640 });
    expect(devices[0].installments).toBeUndefined();
    expect(devices[1].monthlyAmountLater).toBeUndefined();
    expect(devices[3].installments).toBe(36);
    expect(devices[3].startDate).toBeUndefined();
    expect(contractMilestones(devices[3]).month25).toBeUndefined();
  });

  it("過去の特典日でも受取済みにせず、要確認として取り込む", () => {
    const rewarded = parseContractWorkbook(workbookFixture()).contracts[8];
    expect(rewarded).toMatchObject({ rewardAmount: 1000, rewardDate: "2024-07-01", rewardStatus: "review", benefitNote: "特典の説明" });
  });

  it("明細名・支払原文を残し、カードを推定で紐づけない", () => {
    const item = parseContractWorkbook(workbookFixture()).subscriptions[0];
    expect(item.paymentMethod).toBe("Original Card");
    expect(item.sub.card).toBeUndefined();
    expect(item.sub.contractImport).toMatchObject({ paymentMethod: "Original Card", statementName: "STATEMENT NAME", discount: "学割", reviewStatus: "review" });
    expect(item.sub.note).toContain("STATEMENT NAME");
  });

  it("月次更新日が未入力なら数式の保存日付を実際の支払日とみなさない", () => {
    const parsed = parseContractWorkbook(workbookFixture());
    const unknownDay = parsed.subscriptions[2];
    expect(unknownDay.sub.renewalDay).toBeUndefined();
    expect(unknownDay.sub.renewal).toBeUndefined();
    expect(unknownDay.sub.contractImport?.recordedRenewalDate).toBe("2024-03-05");
    expect(parsed.subscriptions[3].sub.renewalDay).toBe(5);
    expect(parsed.warnings.some((message) => message.includes("Month Service 0"))).toBe(true);
  });

  it("現回線シートがなければ旧一覧を現契約へ昇格しない", () => {
    const parsed = parseContractWorkbook({ "Sheet1 (2)": workbookFixture()["Sheet1 (2)"] });
    expect(parsed.contracts).toHaveLength(0);
    expect(parsed.warnings[0]).toContain("現契約として取り込みません");
  });

  it("番号のない端末も行を並べ替えて再取込しても増えない", () => {
    const sheets = workbookFixture();
    const original = parseContractWorkbook(sheets).contracts;
    const reordered = { ...sheets, Device: [...sheets.Device.slice(0, 2), ...sheets.Device.slice(2).reverse()] };
    const incoming = parseContractWorkbook(reordered).contracts;
    expect(incoming.filter((item) => item.kind === "device").map((item) => item.id).sort()).toEqual(original.filter((item) => item.kind === "device").map((item) => item.id).sort());
    expect(mergeContractImports(original, incoming).added).toBe(0);
  });

  it("同一条件で番号のない複数端末を黙って一件へ統合せず保留する", () => {
    const sheets = workbookFixture();
    sheets.Device.push([...sheets.Device[3]]);
    const parsed = parseContractWorkbook(sheets);
    expect(parsed.contracts.filter((item) => item.kind === "device")).toHaveLength(3);
    expect(parsed.contracts.some((item) => item.device === "Phone Beta")).toBe(false);
    expect(parsed.warnings.some((message) => message.includes("Phone Beta") && message.includes("契約番号"))).toBe(true);
  });
});

describe("重複しない取り込みと利用者の編集保護", () => {
  it("同じシートを再取込しても件数が増えず、確認状態・編集額・連携先を保つ", () => {
    const incoming = parseContractWorkbook(workbookFixture()).contracts;
    const first = mergeContractImports([], incoming);
    const edited = { ...first.contracts[0], status: "active" as const, monthlyAmount: 777, linkedSubId: "user-selected" };
    const existing = [edited, ...first.contracts.slice(1)];
    const again = mergeContractImports(existing, parseContractWorkbook(workbookFixture()).contracts);
    expect(first.added).toBe(15);
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(15);
    expect(again.contracts[0]).toBe(edited);
    expect(findExistingContract([line({ phone: "000-0000-0001" })], incoming[0])).toBeDefined();
  });

  it("サービスの表記揺れは既存に照合し、異なる会員サービスは分ける", () => {
    const names = ["Apple Music", "iCloud+", "YouTube Premium", "U-NEXT", "JAL Wellness", "NewsPicks", "J SPORTS", "Example LINK"];
    const existing = names.map((name, index) => sub({ id: `saved-${index}`, name }));
    const candidates = ["Apple Music", "iCloud+ 200GB", "YouTube Premium", "U-NEXT", "JAL Wellness&Travel", "NewsPicks Premium", "J-Sports 野球パック U25", "Example Fan Club"].map((name) => candidate(name));
    expect(planSubscriptionImport(existing, candidates).map((proposal) => proposal.action)).toEqual(["match", "match", "match", "match", "match", "match", "match", "new"]);
  });

  it("既存の金額・カード・更新日・終了日・メモを完全保持する", () => {
    const existing = [sub({ name: "Music Service", amount: 987, card: "My Card", renewalDay: 6, renewal: "2027-01-06", endDate: "2027-02-01", note: "user edited" })];
    const imported = candidate("Music Service", { amount: 123, card: "Other Card", renewalDay: 5 });
    const result = mergeSubscriptionImports(existing, [imported], [imported.id]);
    expect(result.added).toBe(0);
    expect(result.subs).toEqual(existing);
    expect(result.subs[0]).toBe(existing[0]);
  });

  it("明示選択した新規候補だけ追加し、再取込・同名候補も一度に限る", () => {
    const candidates = [candidate("Example"), candidate("ＥＸＡＭＰＬＥ"), candidate("Unselected")];
    expect(mergeSubscriptionImports([], candidates, []).added).toBe(0);
    const result = mergeSubscriptionImports([], candidates, [candidates[0].id, candidates[1].id]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.subs).toHaveLength(1);
    const edited = [{ ...result.subs[0], name: "Renamed by user", amount: 678 }];
    expect(mergeSubscriptionImports(edited, [candidates[0]], [candidates[0].id]).subs).toEqual(edited);
  });

  it("既存同名が複数あると曖昧と表示し、三つ目を作らない", () => {
    const existing = [sub({ id: "a" }), sub({ id: "b" })];
    const item = candidate("Service");
    expect(planSubscriptionImport(existing, [item])[0].action).toBe("ambiguous");
    expect(mergeSubscriptionImports(existing, [item], [item.id]).subs).toHaveLength(2);
  });

  it("選択済みでも不明額・不正額・負額は登録せず、明示された0円は登録する", () => {
    const amounts = ["", "unknown", "-1", -100, Infinity, NaN, 0, "1,200円"];
    const candidates = amounts.map((amount, index) => candidate(`Amount test ${index}`, { amount }));
    expect(amounts.map(isImportableSubscriptionAmount)).toEqual([false, false, false, false, false, false, true, true]);
    const result = mergeSubscriptionImports([], candidates, candidates.map((item) => item.id));
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(6);
    expect(result.subs[0].amount).toBe(0);
    expect(result.subs[1].amount).toBe(1200);
  });
});

describe("保存データの境界", () => {
  it("不正型を除き、未知フィールドと0円を残し、元オブジェクトを変えない", () => {
    const raw = { ...line(), status: "invalid", monthlyAmount: "0", startDate: "2024-02-30", monthlyAmountLater: Infinity, custom: "keep", history: [null] };
    const parsed = normalizeContracts([null, {}, { ...line(), kind: "other" }, raw, raw]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ status: "review", monthlyAmount: 0, custom: "keep" });
    expect(parsed[0].startDate).toBeUndefined();
    expect(parsed[0].monthlyAmountLater).toBeUndefined();
    expect(parsed[0].history).toEqual([]);
    expect(raw.status).toBe("invalid");
    expect(normalizeContracts(null)).toEqual([]);
  });

  it("削除された定期費への連携だけ外し、正常なら同じ配列を返す", () => {
    const existing = [line({ linkedSubId: "existing-sub" }), line({ id: "second", linkedSubId: "deleted-sub" })];
    const result = unlinkMissingSubscriptions(existing, [sub()]);
    expect(result[0]).toBe(existing[0]);
    expect(result[1].linkedSubId).toBeUndefined();
    expect(existing[1].linkedSubId).toBe("deleted-sub");
    expect(unlinkMissingSubscriptions(result, [sub()])).toBe(result);
  });
});
