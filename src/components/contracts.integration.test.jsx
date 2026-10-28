// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Contracts } from "./contracts.jsx";
import { fixedForMonth } from "../utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const line = (overrides = {}) => ({
  id: "line-demo", kind: "line", name: "テスト回線", status: "active",
  phone: "09000001234", monthlyAmount: 900, startDate: "2026-04-01",
  ...overrides,
});
const device = (overrides = {}) => ({
  id: "device-demo", kind: "device", name: "テスト端末", status: "review",
  monthlyAmount: 100, monthlyAmountLater: 2700, startDate: "2024-03-01",
  ...overrides,
});
const fee = (overrides = {}) => ({
  id: "fee-demo", name: "既存の通信費", amount: 1800, cycle: "monthly",
  category: "通信", card: "", startDate: "2026-01-01", renewal: "2026-11-01",
  note: "家計簿で確認済み", ...overrides,
});

let container, root, latest, commits;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  commits = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function render(contracts, subs = [], cards = []) {
  const initial = { contracts: structuredClone(contracts), subs: structuredClone(subs) };
  function Harness() {
    const [state, setState] = useState(initial);
    latest = state;
    return <Contracts {...state} cards={cards} ym="2026-10" onCommit={(next) => {
      commits(next); setState(next);
    }} />;
  }
  await act(async () => root.render(<Harness />));
}

function button(name) {
  const buttons = [...container.querySelectorAll("button")];
  const named = buttons.filter((node) => node.getAttribute("aria-label") === name);
  const matches = named.length ? named : buttons.filter((node) => node.textContent.trim() === name);
  expect(matches, `button: ${name}`).toHaveLength(1);
  return matches[0];
}
function field(label) {
  const labelled = [...container.querySelectorAll("label")].find((node) => node.textContent.trim() === label && node.htmlFor);
  const control = labelled ? document.getElementById(labelled.htmlFor) : container.querySelector(`[aria-label="${label}"]`);
  expect(control, `field: ${label}`).toBeTruthy();
  return control;
}
function checkbox(label) {
  const labelled = [...container.querySelectorAll("label")].find((node) => node.textContent.trim() === label);
  const control = labelled?.querySelector('input[type="checkbox"]');
  expect(control, `checkbox: ${label}`).toBeTruthy();
  return control;
}
async function click(node) {
  await act(async () => node.click());
}
async function fill(label, value) {
  const node = field(label);
  const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  await act(async () => {
    setter.call(node, value);
    node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function openLine() { await click(button("テスト回線の詳細")); }
async function openDevice() {
  await click(button("端末 1"));
  await click(button("テスト端末の詳細"));
}

describe("契約台帳と定期費の連携", () => {
  it("既存の定期費に連携しても金額・更新日・件数を変更しない", async () => {
    const original = fee({ amount: 2300, endDate: "2027-03-31" });
    await render([line()], [original]);
    const expectedPlan = fixedForMonth(latest.subs, "2026-10");
    await openLine();
    await click(button("定期費に連携する"));
    await fill("連携する定期費", original.id);
    await click(button("この定期費に連携する"));

    expect(latest.contracts[0].linkedSubId).toBe(original.id);
    expect(latest.subs).toEqual([original]);
    expect(fixedForMonth(latest.subs, "2026-10")).toBe(expectedPlan);
    expect(Object.keys(commits.mock.lastCall[0]).sort()).toEqual(["contracts", "subs"]);
  });

  it("ポイントを受取済みにしても支払いを追加・変更せず、付与予定だけを完了する", async () => {
    const original = fee();
    await render([line({ linkedSubId: original.id, rewardAmount: 10000, rewardDate: "2026-11-01", rewardStatus: "pending" })], [original]);
    const planBefore = fixedForMonth(latest.subs, "2026-10");
    await openLine();
    await click(button("ポイントを受取済みにする"));
    expect(latest.contracts[0].rewardStatus).toBe("received");
    expect(latest.subs).toEqual([original]);
    expect(fixedForMonth(latest.subs, "2026-10")).toBe(planBefore);
    await click(button("閉じる"));
    await click(button("期限"));
    await click(button("すべて"));
    expect(container.textContent).not.toContain("ポイント付与予定");
  });

  it("端末代は現在の金額と分割払いの重複確認を満たしてから新規作成する", async () => {
    await render([device()]);
    await openDevice();
    await click(button("定期費に連携する"));
    expect(field("確認済みの月額").value).toBe("");

    await click(button("定期費を作成して連携"));
    expect(commits).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain("確認済みの月額");

    await fill("確認済みの月額", "2700");
    await click(button("定期費を作成して連携"));
    expect(commits).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain("分割払いとの重複");

    await click(checkbox("この端末代を分割払いに重複登録していない"));
    await click(button("定期費を作成して連携"));
    expect(latest.subs).toHaveLength(1);
    expect(latest.subs[0]).toMatchObject({ amount: 2700, cycle: "monthly", startDate: "2026-10-28", category: "端末" });
    expect(latest.contracts[0].linkedSubId).toBe(latest.subs[0].id);
    expect(fixedForMonth(latest.subs, "2026-09")).toBe(0);
    expect(fixedForMonth(latest.subs, "2026-10")).toBe(2700);
  });

  it("年払いに連携した端末は月額を明示入力するまで定期費を月払いに変更しない", async () => {
    const original = fee({ name: "年払いの端末代", amount: 30000, cycle: "yearly", category: "端末" });
    await render([device({ linkedSubId: original.id })], [original]);
    await openDevice();
    await click(button("編集"));
    await click(checkbox("定期費の料金・開始日・終了日も更新する"));
    expect(field("定期費に反映する月額").value).toBe("");
    expect(container.querySelector('[role="dialog"]').textContent).toContain("年払いから月払いに変わります");
    await click(button("保存して定期費に反映"));
    expect(commits).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain("定期費に反映する月額");
    expect(latest.subs).toEqual([original]);

    await fill("定期費に反映する月額", "2500");
    await click(button("保存して定期費に反映"));
    expect(latest.subs).toHaveLength(1);
    expect(latest.subs[0]).toMatchObject({ id: original.id, amount: 2500, cycle: "monthly", note: original.note });
    expect(latest.contracts[0].linkedSubId).toBe(original.id);
    expect(fixedForMonth(latest.subs, "2026-10")).toBe(2500);
  });

  it("連携済みの契約から別の定期費を新規増設できない", async () => {
    const original = fee();
    await render([line({ linkedSubId: original.id })], [original]);
    await openLine();
    await click(button("定期費の連携を変更"));
    expect(button("新しく作成").disabled).toBe(true);
    await click(button("新しく作成"));
    expect(container.textContent).not.toContain("確認済みの月額");
    await click(button("この定期費に連携する"));
    expect(latest.subs).toEqual([original]);
    expect(latest.contracts[0].linkedSubId).toBe(original.id);
  });

  it("契約だけ終了しても定期費は暗黙に変更せず、継続中の案内を表示する", async () => {
    const original = fee();
    await render([line({ linkedSubId: original.id })], [original]);
    await openLine();
    await click(button("編集"));
    await fill("状況", "ended");
    await fill("終了予定日・解約日", "2026-10-27");
    await click(button("保存"));

    expect(latest.contracts[0]).toMatchObject({ status: "ended", endDate: "2026-10-27" });
    expect(latest.subs).toEqual([original]);
    expect(container.querySelector('[role="dialog"]').textContent).toContain("連携先の支払い予定は継続中");
  });

  it("終了した契約の定期費同期には終了日を必須とし、明示操作後だけ予定を止める", async () => {
    const original = fee();
    await render([line({ linkedSubId: original.id })], [original]);
    await openLine();
    await click(button("編集"));
    await fill("状況", "ended");
    await click(checkbox("定期費の料金・開始日・終了日も更新する"));
    await click(button("保存して定期費に反映"));
    expect(commits).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain("終了する日付");

    await fill("終了予定日・解約日", "2026-10-27");
    await click(button("保存して定期費に反映"));
    expect(latest.subs).toHaveLength(1);
    expect(latest.subs[0]).toMatchObject({ id: original.id, amount: 900, endDate: "2026-10-27", note: original.note, renewal: original.renewal });
    expect(fixedForMonth(latest.subs, "2026-11")).toBe(0);
  });

  it("電話番号は初期表示と詳細で隠し、明示的な表示操作だけで全文を見せる", async () => {
    const phone = "09000001234";
    await render([line({ phone })]);
    expect(container.textContent).not.toContain(phone);
    expect(container.textContent).toContain("•••• 1234");
    await openLine();
    expect(container.querySelector('[role="dialog"]').textContent).not.toContain(phone);
    await click(button("番号を表示"));
    expect(container.querySelector('[role="dialog"]').textContent).toContain(phone);
    await click(button("番号を隠す"));
    expect(container.querySelector('[role="dialog"]').textContent).not.toContain(phone);
    await click(button("閉じる"));
    await openLine();
    expect(container.querySelector('[role="dialog"]').textContent).not.toContain(phone);
  });

  it("複数の契約が同じ定期費を参照しても月換算を一度だけ合算する", async () => {
    const original = fee({ amount: 3210 });
    await render([
      line({ linkedSubId: original.id }),
      line({ id: "line-secondary", name: "別のテスト回線", phone: "08000005678", linkedSubId: original.id }),
    ], [original]);
    const label = [...container.querySelectorAll("div")].find((node) => node.childElementCount === 0 && node.textContent === "連携した定期費・月換算");
    expect(label.parentElement.textContent).toContain("¥3,210");
    expect(label.parentElement.textContent).toContain("2 / 2契約を連携");
    expect(latest.subs).toEqual([original]);
  });
});
