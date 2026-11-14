import { expect, it } from "vitest";
import { classifyCardRows } from "./card-purposes";

it("separates Prime membership charges and refunds from ordinary Amazon purchases", () => {
  const rows = [
    { description:"Amazonプライム会費", amount:-2344 },
    { description:"Amazonプライム会費 (返品)", amount:5029 },
    { description:"Amazon.co.jp", amount:-1100 },
    { description:"ラジコ ダブルプラン", amount:-865 },
    { description:"APPLE.COM/BILL", amount:-980 },
  ];
  const result = classifyCardRows(rows);
  expect(result.map(row=>row.spendingCategory)).toEqual(["サブスク","サブスク","物販","サブスク","Apple決済"]);
  expect(result[0].subscriptionLabel).toBe(result[1].subscriptionLabel);
  expect(result.map(row=>row.amount)).toEqual(rows.map(row=>row.amount));
});

it("labels confirmed Ondoku charges and refunds while retaining their billing description", () => {
  const rows = [
    { description:"株式会社さん", amount:-1078, spendingCategory:"サブスク" },
    { description:"株式会社さん (返品)", amount:1078 },
    { description:"株式会社さん", amount:-500 },
  ];
  const result = classifyCardRows(rows);
  expect(result.map(row=>row.subscriptionLabel)).toEqual(["音読さん","音読さん",undefined]);
  expect(result.map(row=>row.description)).toEqual(rows.map(row=>row.description));
});
