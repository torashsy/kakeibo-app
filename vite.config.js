import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base:"./" — GitHub Pages(サブパス配信)でも動くよう、アセットを相対パスで参照する
// __BUILD_ID__ — どの版が動いているか画面で確認できるようにする。
// 古いキャッシュのまま動いているのか、直っていないのかを切り分けるため。
const buildId = (process.env.GITHUB_SHA || "").slice(0, 7)
  || new Date().toISOString().slice(0, 16).replace("T", " ");
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
});
