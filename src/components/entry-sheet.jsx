import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { styles } from "../styles";

export function EntrySheet({ onClose, children, label = "記録の入力", portal = false }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const top = window.scrollY;
    const original = { position:document.body.style.position, top:document.body.style.top, width:document.body.style.width };
    Object.assign(document.body.style, {position:"fixed", top:`-${top}px`, width:"100%"});
    if (!panel.current.contains(document.activeElement)) panel.current.focus({preventScroll:true});
    const keydown = event => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      const items = [...panel.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')]
        .filter(node => node.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      Object.assign(document.body.style, original);
      window.scrollTo({top, behavior:"instant"});
      if (previous?.isConnected) previous.focus({preventScroll:true});
    };
  }, []);
  const sheet = <div style={styles.sheetBackdrop} onClick={onClose}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="entry-sheet" style={styles.sheet} onClick={event=>event.stopPropagation()}>
      {children}
    </div>
  </div>;
  // Animated page containers create a stacking context below the navigation.
  const target = portal && document.querySelector('.ledger-app');
  return target ? createPortal(sheet, target) : sheet;
}
