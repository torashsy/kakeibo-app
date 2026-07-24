import "./storage.js";          // window.storage を用意(App.jsx より前に読み込む)
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// iOS/Androidが数字を電話番号として自動リンク化(青文字)するのを抑止する。
// Artifactプレビューでは index.html の <head> が使われないため、実行時にも念のため差し込む。
if (typeof document !== "undefined" && !document.querySelector('meta[name="format-detection"]')) {
  const m = document.createElement("meta");
  m.name = "format-detection";
  m.content = "telephone=no,date=no,email=no,address=no";
  document.head.appendChild(m);
}

// ソフトウェアキーボード表示中の実際の表示領域にボトムシートを収める。
// iOSでは position:fixed はレイアウトビューポート基準のため、キーボードで縮んだ表示領域(visual viewport)が
// 上下にずれる(offsetTop)。高さだけでなくオフセットもCSS変数に反映し、シート土台を実際の表示領域に重ねる。
if (typeof window !== "undefined" && window.visualViewport) {
  const syncViewport = () => {
    const vv = window.visualViewport;
    document.documentElement.style.setProperty("--visual-viewport-height", `${vv.height}px`);
    document.documentElement.style.setProperty("--vv-offset-top", `${vv.offsetTop || 0}px`);
  };
  syncViewport();
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
  // 入力欄がキーボードに隠れないよう最小限だけスクロール(center だとページごと動いてシートがずれるため nearest)。
  document.addEventListener("focusin", (event) => {
    if (event.target && event.target.matches?.("input, textarea, select")) {
      window.setTimeout(() => { syncViewport(); event.target.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 150);
    }
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);

// PWA: 本番(https配信)でのみService Workerを登録。無い環境(プレビュー等)では黙って何もしない。
if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
