import { useRef } from "react";

// Keep vertical scrolling, zoom, native edge-back and editable controls native.
export function useHorizontalSwipe(onSwipe, enabled = true) {
  const gesture = useRef(null);
  const reset = element => {
    gesture.current = null;
    element.style.removeProperty("--swipe-drag");
    delete element.dataset.swiping;
  };
  return {
    onPointerDown(event) {
      if (!event.isPrimary) { reset(event.currentTarget); return; }
      if (!enabled || !["touch", "pen"].includes(event.pointerType)) return;
      if (gesture.current) { reset(event.currentTarget); return; }
      if (event.clientX < 24 || event.clientX > window.innerWidth - 24) return;
      if (event.target.closest("button,a,input,textarea,select,summary,table,[role=slider],[data-no-swipe]")) return;
      for (let el = event.target; el && el !== event.currentTarget; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return;
      }
      gesture.current = {id:event.pointerId, x:event.clientX, y:event.clientY, time:event.timeStamp, axis:null};
    },
    onPointerMove(event) {
      const g = gesture.current;
      if (!g || g.id !== event.pointerId) return;
      const dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        g.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
      }
      if (g.axis !== "x") return;
      event.currentTarget.dataset.swiping = "true";
      event.currentTarget.style.setProperty("--swipe-drag", `${Math.max(-32, Math.min(32, dx * .2))}px`);
    },
    onPointerUp(event) {
      const g = gesture.current;
      reset(event.currentTarget);
      if (!g || g.id !== event.pointerId || g.axis === "y") return;
      const dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (event.timeStamp - g.time > 900 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel(event) { reset(event.currentTarget); },
    onLostPointerCapture(event) { reset(event.currentTarget); },
  };
}
