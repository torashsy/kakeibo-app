// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { classifyCardRows } from "../card-purposes";
import { SpendingPurpose } from "./summary";

it("opens on transactions and shows review only for the selected period's unresolved purchases", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const purchases = classifyCardRows([
    {id:"a", date:"2026-10-08", description:"APPLE.COM/BILL", account:"A", amount:-100},
    {id:"b", date:"2026-10-07", description:"食品店", account:"A", spendingCategory:"食料品", amount:200},
    {id:"c", date:"2026-11-04", description:"食品店", account:"A", spendingCategory:"食料品", amount:-300},
  ]);
  const render = ym => act(() => root.render(<SpendingPurpose ym={ym} cutoff={1} purchases={purchases}/>));
  const find = name => [...host.querySelectorAll("button")].find(b=>b.textContent === name);
  try {
    await render("2026-10");
    expect(find("明細").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelectorAll(".card-ledger li")).toHaveLength(2);
    expect(host.querySelector(".ledger-refund").textContent).toContain("返金");
    await act(()=>find("要確認 1件").click());
    expect(host.querySelectorAll(".card-ledger li")).toHaveLength(1);
    await render("2026-11");
    expect(host.querySelector(".card-ledger").textContent).toContain("食品店");
    expect(find("要確認 1件")).toBeUndefined();
    await act(()=>find("用途別").click());
    expect(host.querySelector(".spend-row").textContent).toContain("食費");
  } finally {
    await act(()=>root.unmount());
  }
});
