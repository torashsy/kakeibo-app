// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useHorizontalSwipe } from "./use-horizontal-swipe";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, region, navigate, open;
function Harness({enabled=true}) {
  const handlers = useHorizontalSwipe(navigate, enabled);
  return <div {...handlers}><span>Report</span><button onClick={open}>Open details</button><input/><div className="scroll"><table><tbody><tr><td>Scrollable data</td></tr></tbody></table></div></div>;
}
beforeEach(async () => {
  host=document.createElement("div"); document.body.append(host);
  root=createRoot(host); navigate=vi.fn(); open=vi.fn();
  await act(async()=>root.render(<Harness/>)); region=host.firstElementChild;
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function touch(type,x,y=100,target=region,extra={}) {
  const point={identifier:1,clientX:x,clientY:y};
  const event=new Event(type,{bubbles:true,cancelable:true,...extra});
  Object.assign(event,{touches:extra.touches ?? (type==='touchend'||type==='touchcancel'?[]:[point]),changedTouches:[point]});
  act(()=>target.dispatchEvent(event));
  return event;
}
function swipe(target=region,from=220,to=110) {
  touch('touchstart',from,100,target);const move=touch('touchmove',to,100,target);touch('touchend',to,100,target);
  return move;
}
it("moves one month in each direction, including short deliberate swipes",()=>{
  expect(swipe().defaultPrevented).toBe(true);
  expect(navigate).toHaveBeenCalledExactlyOnceWith(1);
  swipe(region,100,145);
  expect(navigate).toHaveBeenLastCalledWith(-1);
});
it("swipes from buttons without activating them, while ordinary taps still work",()=>{
  const button=region.querySelector('button');
  swipe(button);
  act(()=>button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(navigate).toHaveBeenCalledExactlyOnceWith(1); expect(open).not.toHaveBeenCalled();
  touch('touchstart',200,100,button);touch('touchend',200,100,button);
  act(()=>button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1})));
  expect(open).toHaveBeenCalledOnce();
});
it("does not reinterpret vertical scrolling or a non-cancelable move",()=>{
  touch('touchstart',200);expect(touch('touchmove',190,140).defaultPrevented).toBe(false);touch('touchmove',100,160);touch('touchend',100,160);
  touch('touchstart',200);touch('touchmove',100,100,region,{cancelable:false});touch('touchend',100);
  expect(navigate).not.toHaveBeenCalled();
});
it("preserves forms, native screen edges and horizontally scrollable tables",()=>{
  swipe(region.querySelector('input')); swipe(region,5,100);
  const scroller=region.querySelector('.scroll');scroller.style.overflowX='auto';
  Object.defineProperty(scroller,'scrollWidth',{value:600});Object.defineProperty(scroller,'clientWidth',{value:300});
  expect(swipe(scroller.querySelector('td')).defaultPrevented).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});
it("ignores short drags, cancellation and multitouch",()=>{
  swipe(region,200,180);
  touch('touchstart',200);touch('touchmove',100);touch('touchcancel',100);touch('touchend',100);
  touch('touchstart',200);touch('touchmove',100,100,region,{touches:[{identifier:1},{identifier:2}]});touch('touchend',100);
  expect(navigate).not.toHaveBeenCalled();
});
it("uses the current callback and disables gestures immediately when a sheet opens",async()=>{
  navigate=vi.fn();await act(async()=>root.render(<Harness/>));swipe();expect(navigate).toHaveBeenCalledOnce();
  touch('touchstart',220);await act(async()=>root.render(<Harness enabled={false}/>));touch('touchmove',100);touch('touchend',100);
  swipe(); expect(navigate).toHaveBeenCalledOnce();
});
