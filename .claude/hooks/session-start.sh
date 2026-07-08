#!/bin/bash
set -euo pipefail

# Claude Code on the web 用のセットアップ。
# セッション開始時に依存関係をインストールし、npm run dev / build がすぐ動く状態にする。

cd "$CLAUDE_PROJECT_DIR"

# ローカル(非リモート)では何もしない
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# 依存インストール（キャッシュを活かすため ci ではなく install を使用・冪等）
npm install
