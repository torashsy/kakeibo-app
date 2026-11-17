import { useEffect, useLayoutEffect, useRef, useState } from "react";

const home = { tab: "today", section: "month" };
export const homeSections = ["month", "funds", "invest", "pay"];
export const homeLabels = { month:"ホーム", spend:"カード利用", flow:"収支実績", funds:"残高", invest:"投資", pay:"給与" };
export const tabLabels = { today:"ホーム", records:"記録", plan:"計画", recurring:"定期費", settings:"設定", finance:"明細・同期", design:"表示設定", cards:"カード管理" };
export const pageLabel = page => page.tab === "today" ? homeLabels[page.section] : tabLabels[page.tab];

export function usePageNavigation() {
  const [page, setPage] = useState(() => window.history.state?.kakeiboPage || home);
  const entry = useRef(window.history.state?.kakeiboEntry || 0);
  const positions = useRef(new Map());
  const destinationY = useRef(null);

  useEffect(() => {
    const history = window.history;
    const previousMode = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const restore = event => {
      positions.current.set(entry.current, window.scrollY);
      entry.current = event.state?.kakeiboEntry || 0;
      destinationY.current = positions.current.get(entry.current) ?? event.state?.kakeiboScroll ?? 0;
      setPage(event.state?.kakeiboPage || home);
    };
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      history.scrollRestoration = previousMode;
    };
  }, []);

  useLayoutEffect(() => {
    document.title = pageLabel(page) + " · 家計簿";
    if (destinationY.current !== null) {
      window.scrollTo({ top:destinationY.current, behavior:"instant" });
      destinationY.current = null;
    }
  }, [page]);

  function visit(tab, section="month", drill=false) {
    if (tab===page.tab && section===page.section) return;
    const history = window.history;
    positions.current.set(entry.current, window.scrollY);
    history.replaceState({...history.state, kakeiboScroll:window.scrollY}, "");
    const next = { tab, section, parent:drill ? {tab:page.tab,section:page.section} : null };
    entry.current += 1;
    positions.current.delete(entry.current);
    history.pushState({...history.state, kakeiboPage:next, kakeiboEntry:entry.current, kakeiboScroll:0}, "");
    destinationY.current = 0;
    setPage(next);
  }
  return { page, visit, back:() => window.history.back() };
}
