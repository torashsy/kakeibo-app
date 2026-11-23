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
async function swipe(selector, from, to) {
  const target=container.querySelector(selector);
  await act(async()=>{
    for(const [type,x] of [["touchstart",from],["touchmove",to],["touchend",to]]) {
      const point={identifier:1,clientX:x,clientY:150};
      const event=new Event(type,{bubbles:true,cancelable:true});
      Object.assign(event,{touches:type==='touchend'?[]:[point],changedTouches:[point]});
      target.dispatchEvent(event);
    }
  });
}
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

it("本文の横スワイプは月を移動し、選択タブと家計データを保持する",async()=>{
  await mount(); await click("ホーム");
  const original=stored.get("entries");
  await swipe('.home-overview',100,240);
  expect(container.querySelector('.month-selection select').value).toBe('2026-09');
  expect(container.querySelector('.report-sections [aria-current]').textContent).toBe('収支');
  await click('投資');
  await swipe('.home-overview',240,100);
  expect(container.querySelector('.month-selection select').value).toBe('2026-10');
  expect(container.querySelector('.report-sections [aria-current]').textContent).toBe('投資');
  await swipe('.month-toolbar',100,240);
  expect(container.querySelector('.month-selection select').value).toBe('2026-09');
  expect(container.querySelector('.report-sections [aria-current]').textContent).toBe('投資');
  expect(stored.get('entries')).toBe(original);
  for(const page of ['記録','計画']) {
    await click(page);
    const month=container.querySelector('.month-selection select').value;
    await swipe('.ledger-main',240,100);
    expect(container.querySelector('.month-selection select').value).not.toBe(month);
    await swipe('.ledger-main',100,240);
    expect(container.querySelector('.month-selection select').value).toBe(month);
  }
  expect(stored.get('entries')).toBe(original);
});

it("収支実績はホーム内で開閉し、月・ナビゲーション履歴・家計データを保持する",async()=>{
  await mount();await click('ホーム');
  const before=stored.get('entries'),history=window.history.state,month=container.querySelector('.month-selection select').value;
  const disclosure=container.querySelector('.actual-disclosure');
  expect(disclosure.open).toBe(false);
  await act(()=>disclosure.querySelector('summary').click());
  expect(disclosure.open).toBe(true);
  expect(disclosure.textContent).toContain('収支の内訳');
  expect(window.history.state).toEqual(history);
  expect(container.querySelector('.report-sections [aria-current]').textContent).toBe('収支');
  expect(container.querySelector('.month-selection select').value).toBe(month);
  await act(()=>disclosure.querySelector('summary').click());
  expect(disclosure.open).toBe(false);
  expect(stored.get('entries')).toBe(before);
});

it("計画の編集はナビより上に開き、閉じると元の位置と入力ボタンへ戻る",async()=>{
  await mount();await click('計画');await click('予算を編集');
  const saved=stored.get('plans'),entries=stored.get('entries');
  const opener=button('その他の収入を編集');opener.focus();
  await act(()=>opener.click());
  const dialog=container.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  expect(dialog.closest('.ledger-main')).toBeNull();
  expect(document.body.style.position).toBe('fixed');
  const month=container.querySelector('.month-selection select').value;
  await swipe('[role="dialog"]',240,100);
  expect(container.querySelector('.month-selection select').value).toBe(month);
  await act(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.style.position).not.toBe('fixed');
  expect(document.activeElement).toBe(opener);
  expect(stored.get('plans')).toBe(saved);expect(stored.get('entries')).toBe(entries);
});

describe("契約台帳の保存・バックアップ", () => {
  it("ポイントを入力して保存し、ダイアログは本文の重なりから独立する",async()=>{
    await mount();await click('ホーム');await click('残高');await click('ポイント・マイル');await click('＋ ポイントを追加');
    const form=container.querySelector('.deadline-editor');
    const fields=form.querySelectorAll('input');
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    for(const [node,value] of [[fields[0],'新しいポイント'],[fields[1],'3456']]) {
      await act(()=>{set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
    }
    const mode=form.querySelector('select[aria-label="有効期限"]');
    await act(()=>{mode.value='date';mode.dispatchEvent(new Event('change',{bubbles:true}));});
    const date=form.querySelector('input[type="date"]');
    await act(()=>{set.call(date,'2026-11-10');date.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(form.closest('.ledger-main')).toBeNull();
    await click('保存');
    expect(container.querySelector('.deadline-editor')).toBeNull();
    expect(JSON.parse(stored.get('points'))[0]).toMatchObject({name:'新しいポイント',amount:3456,expiresOn:'2026-11-10'});
    expect(container.querySelector('.ledger-main').dataset.view).toBe('today');
    await act(()=>container.querySelector('.point-balances button').click());
    await click('記録を削除');
    expect(JSON.parse(stored.get('points'))).toHaveLength(1);
    await click('削除する');
    expect(JSON.parse(stored.get('points'))).toEqual([]);
  });
  it("期限一覧から定期費を開き、期限だけ更新して料金を保持する",async()=>{
    await mount();await click('定期費');await click('更新・期限');await click('すべて');
    await act(()=>[...container.querySelectorAll('.deadline-list button')].find(n=>n.textContent.includes('検証通信費')).click());
    const dialog=container.querySelector('[role="dialog"]');
    expect(dialog.closest('.ledger-main')).toBeNull();
    const label=[...dialog.querySelectorAll('label')].find(n=>n.textContent==='解約手続きの期限');
    const input=label.nextElementSibling.querySelector('input');
    await act(()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-11-25');
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await click('更新');
    const saved=JSON.parse(stored.get('subs'));
    expect(saved.find(s=>s.id==='keep-fee')).toMatchObject({amount:1000,cancelBy:'2026-11-25'});
  });
  it("ポイントの利用状態を保存・再読込・バックアップし、家計の金額を変えない",async()=>{
    const point={id:'p1',name:'検証ポイント',amount:1200,expiryMode:'date',expiresOn:'2026-11-10',status:'active',note:'期間限定'};
    stored.set('points',JSON.stringify([point]));
    const before=stored.get('entries');
    await mount();await click('ホーム');await click('残高');await click('ポイント・マイル');
    expect(container.textContent).toContain('検証ポイント');
    const row=container.querySelector('.point-balances button');
    await act(()=>row.click());await click('利用済みにする');
    expect(JSON.parse(stored.get('points'))[0]).toMatchObject({...point,status:'used'});
    expect(stored.get('entries')).toBe(before);
    await act(async()=>root.unmount());root=createRoot(container);await mount();
    const backup=await exportBackup();
    expect(backup.points[0]).toMatchObject({...point,status:'used'});
    expect(backup.entries).toEqual([]);expect(backup.subs).toEqual(savedSubs);
  });

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
    const point={id:'keep-point',name:'残すポイント',amount:100,expiryMode:'unknown',status:'active',expiresOn:'',note:''};
    stored.set('points',JSON.stringify([point]));
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
    expect(restored.points).toEqual([point]);
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
