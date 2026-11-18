import { useCallback, useRef } from "react";

// Reserve deliberate horizontal gestures; leave scrolling, zoom and taps native.
export function useHorizontalSwipe(onSwipe, enabled = true) {
  const current = useRef({onSwipe, enabled});
  current.current = {onSwipe, enabled};
  const cleanup = useRef(null);
  const ref = useCallback(element => {
    cleanup.current?.();
    cleanup.current = null;
    if (!element) return;
    let gesture = null, suppressClickUntil = 0;
    const reset = () => { gesture = null; };
    const start = event => {
      reset();
      suppressClickUntil = 0;
      if (!current.current.enabled || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX < 20 || touch.clientX > window.innerWidth - 20) return;
      if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=slider],[role=dialog],[data-no-swipe]')) return;
      for (let el = event.target; el; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return;
        if (el === element) break;
      }
      gesture = {id:touch.identifier, x:touch.clientX, y:touch.clientY, time:event.timeStamp, axis:null};
    };
    const move = event => {
      if (!gesture) return;
      if (event.touches.length !== 1 || !current.current.enabled) { reset(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
      }
      if (gesture.axis !== 'x') return;
      // Once native scrolling wins, do not reinterpret it as month navigation.
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      suppressClickUntil = Date.now() + 700;
    };
    const end = event => {
      const g = gesture;
      reset();
      if (!g || !current.current.enabled || g.axis !== 'x' || event.touches.length) return;
      const touch = Array.from(event.changedTouches).find(t => t.identifier === g.id);
      if (!touch) return;
      const dx = touch.clientX - g.x, dy = touch.clientY - g.y;
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = Date.now() + 700;
      if (event.timeStamp - g.time > 1500 || Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      current.current.onSwipe(dx < 0 ? 1 : -1);
    };
    const click = event => {
      // Suppress the click after a swipe, but preserve keyboard activation.
      if (event.detail && Date.now() < suppressClickUntil) {
        event.preventDefault(); event.stopPropagation(); suppressClickUntil = 0;
      }
    };
    element.addEventListener('touchstart', start, {passive:true});
    element.addEventListener('touchmove', move, {passive:false});
    element.addEventListener('touchend', end, {passive:false});
    element.addEventListener('touchcancel', reset, {passive:true});
    element.addEventListener('click', click, true);
    cleanup.current = () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', reset);
      element.removeEventListener('click', click, true);
    };
  }, []);
  return {ref};
}