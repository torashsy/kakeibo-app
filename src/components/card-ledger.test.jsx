// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { classifyCardRows } from "../card-purposes";
import { SpendingPurpose } from "./summary";

it('ホームでも全カード・全用途と少数明細を隠さず、利用先も同じ場所で見られる',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div'),root=createRoot(host);
  const categories=['食料品','物販','交通費','サブスク','携帯代','映画館'];
  const purchases=categories.map((spendingCategory,i)=>({id:String(i),date:'2026-11-15',account:'カード'+i,description:'利用先'+i,amount:-(i+1)*100,spendingCategory}));
  const find=name=>[...host.querySelectorAll('button')].find(b=>b.textContent===name);
  try {
    await act(()=>root.render(<SpendingPurpose compact purchases={purchases} ym="2026-11" cutoff={1}/>));
    expect(host.querySelectorAll('.purchase-group')).toHaveLength(6);
    expect(host.querySelectorAll('button.purchase-rank')).toHaveLength(0);
    expect(host.textContent).not.toContain('すべての用途を見る');
    await act(()=>find('カード別').click());
    expect(host.querySelectorAll('.purchase-group')).toHaveLength(6);
    expect(host.querySelectorAll('.spend-transactions>div')).toHaveLength(6);
    expect(host.querySelectorAll('.purchase-more')).toHaveLength(0);
    await act(()=>find('利用先別').click());
    expect(host.querySelectorAll('.purchase-group')).toHaveLength(6);
  } finally {await act(()=>root.unmount());}
});

it("compares card totals and shows review only for the selected period’s unresolved purchases", async () => {
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
    expect(find("カード別").getAttribute("aria-pressed")).toBe("true");
    const card = host.querySelector(".purchase-rank");
    expect(card.textContent).toContain("返金超過 -¥100");
    expect(host.querySelectorAll(".spend-transactions > div")).toHaveLength(2);
    expect(find("Apple決済")).toBeUndefined();
    await act(()=>find("利用先別").click());
    const apple=[...host.querySelectorAll('.purchase-group')].find(group=>group.querySelector('.purchase-name').textContent==='Apple');
    expect(apple.querySelector('.spend-transactions').textContent).toContain('¥100');
    expect(host.querySelectorAll('.spend-transactions > div')).toHaveLength(2);
    await act(()=>find("明細").click());
    expect(host.querySelectorAll(".card-ledger li")).toHaveLength(2);
    expect(host.querySelector(".ledger-refund").textContent).toContain("返金");
    await act(()=>find("要確認 1件").click());
    expect(host.querySelectorAll(".card-ledger li")).toHaveLength(1);
    await render("2026-11");
    expect(host.querySelector(".card-ledger").textContent).toContain("食品店");
    expect(find("要確認 1件")).toBeUndefined();
    await act(()=>find("用途別").click());
    expect(host.querySelector(".purchase-rank").textContent).toContain("食費");
  } finally {
    await act(()=>root.unmount());
  }
});
