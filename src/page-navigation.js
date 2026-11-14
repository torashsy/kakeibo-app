import { useEffect, useState } from "react";

const home = { tab: "today", section: "month" };
export const homeLabels = { month:"ホーム", spend:"カード利用", flow:"収支実績", funds:"残高", invest:"投資", pay:"給与" };
export const tabLabels = { today:"ホーム", records:"記録", plan:"計画", recurring:"定期費", settings:"設定", finance:"明細・同期", design:"表示設定", cards:"カード管理" };
export const pageLabel = page => page.tab === "today" ? homeLabels[page.section] : tabLabels[page.tab];

export function usePageNavigation() {
  const read = () => window.history.state?.kakeiboPage || home;
  const [page, setPage] = useState(read);
  useEffect(() => {
    const restore = () => { setPage(read()); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    window.scrollTo(0,0);
    document.title = pageLabel(page) + " · 家計簿";
  }, [page]);
  function visit(tab, section="month", drill=false) {
    if (tab===page.tab && section===page.section) return;
    const next = { tab, section, parent:drill ? {tab:page.tab,section:page.section} : null };
    window.history.pushState({...window.history.state,kakeiboPage:next},"");
    setPage(next);
  }
  return { page, visit, back:() => window.history.back() };
}
