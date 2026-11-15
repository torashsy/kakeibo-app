import { expect, it } from "vitest";
import { spendingGroup } from "./spending-groups";
import { classifyCardRows } from "./card-purposes";

it("uses six purchase categories and keeps unidentified purchases available for review", () => {
  const categories = ["外食","日用品","タクシー","携帯代","医療費","ゲーム","手数料","サブスク（推定）","Apple決済","未知の分類"];
  const labels = categories.map(spendingCategory=>spendingGroup({spendingCategory})[0]);
  expect(new Set(labels)).toEqual(new Set(["食費","買い物","交通・旅行","通信費","生活・サービス","サブスク","用途未確認"]));
  expect(spendingGroup({spendingCategory:"投資"})).toBeNull();
  const [transfer,fee,unknown] = classifyCardRows([
    {description:"REVOLUT**1234*", amount:-1000},
    {description:"カード年会費", amount:-1000},
    {description:"Square", amount:-1000},
  ]);
  expect(spendingGroup({spendingCategory:"Apple決済"})[0]).toBe("生活・サービス");
  expect(spendingGroup(transfer)).toBeNull();
  expect(spendingGroup(fee)[0]).toBe("生活・サービス");
  expect(spendingGroup(unknown)[0]).toBe("用途未確認");
});

it("groups phone and internet service separately while respecting known purchase purposes", () => {
  const rows = classifyCardRows([
    {description:"UQ mobile", spendingCategory:"携帯代", amount:1000},
    {description:"Wi-Fiサービス", spendingCategory:"未分類", amount:-500},
    {description:"固定電話", mfMinor:"固定電話", amount:-950},
    {description:"iCloud+ 200GB（APPLE.COM/BILL）", mfMajor:"通信費", amount:-450},
    {description:"お名前.com", mfMajor:"通信費", amount:-1000},
  ]);
  expect(rows.map(r=>spendingGroup(r)[0])).toEqual(["通信費","通信費","通信費","サブスク","生活・サービス"]);
});
