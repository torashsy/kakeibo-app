// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage.js", () => ({
  getSyncState: vi.fn(async () => ({ mode: "off", status: "idle", ledgerUserId: null })),
  onSyncChange: vi.fn(() => () => {}),
  onFinanceAuthChange: vi.fn(() => () => {}),
  isFinanceSessionCurrent: vi.fn(() => false),
  readFinanceFeed: vi.fn(async () => ({ mode: "off", feed: null })),
  setSyncConfig: vi.fn(), clearSyncConfig: vi.fn(), signUp: vi.fn(), signIn: vi.fn(),
  signInUser: vi.fn(), signUpUser: vi.fn(), displayName: vi.fn((value) => value),
  signOut: vi.fn(), syncNow: vi.fn(),
}));

import App from "./App.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const savedSubs = [
  { id: "keep-fee", name: "検証通信費", amount: 1000, cycle: "monthly", category: "通信", renewal: "2026-12-01", startDate: "2026-01-01" },
  { id: "removed-fee", name: "検証端末代", amount: 1200, cycle: "monthly", category: "端末", renewal: "2026-12-01", startDate: "2026-01-01" },
];
const savedContracts = [
  { id: "saved-line", kind: "line", name: "保存済み回線", status: "review", phone: "08000001111", monthlyAmount: 1000, startDate: "2026-04-01", linkedSubId: "keep-fee", rewardStatus: "pending", rewardAmount: 4000 },
  { id: "saved-device", kind: "device", name: "保存済み端末", status: "active", monthlyAmount: 1200, linkedSubId: "removed-fee" },
];

let container, root, stored, exportedBlobs;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
  const values = {
    entries: [], config: { accounts: [], salaryItems: [], memoCategories: [], cycleCutoffDay: 0 },
    cards: [{ id: "test-card", name: "検証カード", annualFee: 0 }], debt: {}, memos: [],
    subs: savedSubs, contracts: savedContracts, plans: { version: 3, fyStart: 2026, lines: {} },
    closedMonths: [], financeSuppressed: [], theme: { dark: true, accent: "#1F8A66" },
  };
  stored = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
  window.storage = {
    get: vi.fn(async (key) => stored.has(key) ? { value: stored.get(key) } : null),
    set: vi.fn(async (key, value) => { stored.set(key, value); return { key, value }; }),
  };
  exportedBlobs = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { exportedBlobs.push(blob); return "blob:test-backup"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  window.confirm = vi.fn(() => true);
  window.alert = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  delete window.storage;
  delete window.confirm;
  delete window.alert;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function button(name) {
  const nodes = [...container.querySelectorAll("button")];
  const labelled = nodes.filter((node) => node.getAttribute("aria-label") === name);
  const matches = labelled.length ? labelled : nodes.filter((node) => node.textContent.trim() === name);
  expect(matches, `button: ${name}`).toHaveLength(1);
  return matches[0];
}
async function click(name) { await act(async () => button(name).click()); }
async function mount() { await act(async () => root.render(<App />)); }
async function openContracts() {
  await click("定期費");
  // Resolve the lazy feature chunk without replacing the component under test.
  await import("./components/contracts.jsx");
  await click("回線・端末");
}
async function exportBackup() {
  await click("設定");
  await click("保存");
  expect(exportedBlobs.length).toBeGreaterThan(0);
  return JSON.parse(await exportedBlobs[exportedBlobs.length - 1].text());
}

describe("契約台帳の保存・バックアップ", () => {
  it("契約JSONだけが壊れていても、既存の家計データを保持する", async () => {
    stored.set("contracts", "{invalid-json");
    await mount();
    const exported = await exportBackup();
    expect(exported.entries).toEqual([]);
    expect(exported.debt).toEqual({});
    expect(exported.cards).toHaveLength(1);
    expect(exported.cards[0]).toMatchObject({ id: "test-card", name: "検証カード", annualFee: 0 });
    expect(exported.subs).toEqual(savedSubs);
    expect(exported.contracts).toEqual([]);
    expect(stored.get("contracts")).toBe("{invalid-json");
  });

  it("保存済み契約を読み込み、確認状態の変更を保存して再起動後も維持する", async () => {
    await mount();
    expect(window.storage.get).toHaveBeenCalledWith("contracts", true);
    await openContracts();
    expect(button("保存済み回線の詳細")).toBeTruthy();
    await click("保存済み回線の詳細");
    await click("利用中として確認");
    const persisted = JSON.parse(stored.get("contracts"));
    expect(persisted).toHaveLength(2);
    expect(persisted.find((item) => item.id === "saved-line")).toMatchObject({
      ...savedContracts[0], status: "active",
    });
    expect(JSON.parse(stored.get("subs"))).toEqual(savedSubs);

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    await openContracts();
    await click("保存済み回線の詳細");
    expect(container.querySelector('[role="dialog"]').textContent).toContain("利用中");
    expect(container.querySelector('[role="dialog"]').textContent).not.toContain("利用中として確認");
  });

  it("設定から保存したJSONに契約と連携先の定期費を含める", async () => {
    await mount();
    const exported = await exportBackup();
    expect(exported.contracts).toEqual(savedContracts);
    expect(exported.subs).toEqual(savedSubs);
    expect(exported.entries).toEqual([]);
    expect(exported.contracts.map((item) => item.linkedSubId)).toEqual(["keep-fee", "removed-fee"]);
  });

  it("契約付きバックアップへの総入替を保存し、再起動後も新しい契約だけを表示する", async () => {
    await mount();
    await click("設定");
    const replacementFee = { ...savedSubs[0], id: "replacement-fee", name: "復元した通信費", amount: 2400 };
    const replacementContract = {
      id: "replacement-line", kind: "line", name: "復元した回線", status: "active",
      monthlyAmount: 2400, startDate: "2026-10-01", linkedSubId: "replacement-fee",
    };
    const backup = { entries: [], subs: [replacementFee], contracts: [replacementContract] };
    const file = new File([JSON.stringify(backup)], "replacement-backup.json", { type: "application/json" });
    const input = container.querySelector('input[type="file"][accept="application/json,.json"]');
    expect(input).toBeTruthy();
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(window.confirm).toHaveBeenCalled());
    });

    expect(window.alert).not.toHaveBeenCalled();
    expect(container.textContent).toContain("バックアップから復元しました");
    // Inspect storage after React has flushed all state updaters: a stale
    // unlinking updater must not overwrite the imported contract array.
    expect(JSON.parse(stored.get("subs"))).toEqual([replacementFee]);
    expect(JSON.parse(stored.get("contracts"))).toEqual([replacementContract]);

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    await openContracts();
    expect(button("復元した回線の詳細")).toBeTruthy();
    expect(container.querySelectorAll('button[aria-label$="の詳細"]')).toHaveLength(1);
    expect(container.querySelector('button[aria-label="保存済み回線の詳細"]')).toBeNull();
    await click("端末 0");
    expect(container.querySelectorAll('button[aria-label$="の詳細"]')).toHaveLength(0);
    expect(container.querySelector('button[aria-label="保存済み端末の詳細"]')).toBeNull();
    expect(JSON.parse(stored.get("contracts"))).toEqual([replacementContract]);
  });

  it("契約欄のない旧バックアップでも契約を保持し、失われた定期費のリンクだけを解除する", async () => {
    await mount();
    await click("設定");
    const legacyFee = { ...savedSubs[0], amount: 1500 };
    const legacy = { entries: [], subs: [legacyFee] };
    const file = new File([JSON.stringify(legacy)], "legacy-backup.json", { type: "application/json" });
    const input = container.querySelector('input[type="file"][accept="application/json,.json"]');
    expect(input).toBeTruthy();
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(window.confirm).toHaveBeenCalled());
    });

    expect(window.alert).not.toHaveBeenCalled();
    expect(container.textContent).toContain("バックアップから復元しました");
    const restored = await exportBackup();
    expect(restored.contracts).toHaveLength(2);
    expect(restored.contracts.find((item) => item.id === "saved-line")).toEqual(savedContracts[0]);
    const originalDevice = { ...savedContracts[1] };
    delete originalDevice.linkedSubId;
    expect(restored.contracts.find((item) => item.id === "saved-device")).toEqual(originalDevice);
    expect(restored.subs).toEqual([legacyFee]);
    expect(JSON.parse(stored.get("contracts"))).toEqual(restored.contracts);
    expect(JSON.parse(stored.get("subs"))).toEqual([legacyFee]);
  });
});
