// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useHorizontalSwipe } from "./use-horizontal-swipe";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, region, navigate;
function Harness({enabled=true}) {
  const handlers = useHorizontalSwipe(navigate, enabled);
  return <div {...handlers}><span>Report</span><button>Open details</button><input/><details><summary>Expand</summary></details><table><tbody><tr><td>Scrollable data</td></tr></tbody></table></div>;
}
beforeEach(async () => {
  host=document.createElement("div"); document.body.append(host);
  root=createRoot(host); navigate=vi.fn();
  await act(async()=>root.render(<Harness/>)); region=host.firstElementChild;
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function pointer(type,x,y=100,target=region,extra={}) {
  act(()=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,...extra})));
}
it("switches one page on a horizontal swipe and clears the drag offset",()=>{
  pointer("pointerdown",220); pointer("pointermove",130); pointer("pointerup",110);
  expect(navigate).toHaveBeenCalledExactlyOnceWith(1);
  expect(region.style.getPropertyValue("--swipe-drag")).toBe("");
  pointer("pointerdown",100);pointer("pointermove",190);pointer("pointerup",200);
  expect(navigate).toHaveBeenLastCalledWith(-1);
});
it("does not reinterpret a vertical scroll as a horizontal swipe",()=>{
  pointer("pointerdown",200);pointer("pointermove",190,140);pointer("pointerup",100,160);
  expect(navigate).not.toHaveBeenCalled();
});
it("leaves controls, tables and native screen-edge gestures alone",()=>{
  for(const target of region.querySelectorAll("button,input,summary,td")) {
    pointer("pointerdown",200,100,target);pointer("pointerup",100,100,target);
  }
  pointer("pointerdown",5);pointer("pointerup",100);
  expect(navigate).not.toHaveBeenCalled();
});
it("ignores short drags, mouse drags, cancellation and multitouch",()=>{
  pointer("pointerdown",200);pointer("pointerup",180);
  pointer("pointerdown",200,100,region,{pointerType:"mouse"});pointer("pointerup",100);
  pointer("pointerdown",200);pointer("pointermove",100);pointer("pointercancel",100);pointer("pointerup",100);
  pointer("pointerdown",200);pointer("pointerdown",180,100,region,{pointerId:2,isPrimary:false});pointer("pointerup",100);
  expect(navigate).not.toHaveBeenCalled();
  expect(region.dataset.swiping).toBeUndefined();
});
it("can be disabled on nested views or while a sheet is open",async()=>{
  await act(async()=>root.render(<Harness enabled={false}/>));
  pointer("pointerdown",200);pointer("pointerup",100);
  expect(navigate).not.toHaveBeenCalled();
});
