import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base:"./" — GitHub Pages(サブパス配信)でも動くよう、アセットを相対パスで参照する
export default defineConfig({ base: "./", plugins: [react()] });
