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

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);

// PWA: 本番(https配信)でのみService Workerを登録。無い環境(プレビュー等)では黙って何もしない。
if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
