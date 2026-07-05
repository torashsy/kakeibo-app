# 家計簿アプリ

React + Vite の家計簿アプリ。3カテゴリ入力（給与系/カード/口座）、カード残債・一覧管理、
項目別/表/年間の集計、要素ごとのデザイン編集モードを備える。

## 起動
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 本番ビルド → dist/
```

## 構成（機能ごとに分割済み）
- `src/App.jsx` … アプリのルート（App）とタブバー（TabBtn）
- `src/edit.jsx` … デザイン編集モードの Context と Editable ラッパー
- `src/components/summary.jsx` … サマリ画面
- `src/components/detail.jsx` … 詳細（履歴/項目別/表/年間）
- `src/components/cards.jsx` … カード（残債/一覧）
- `src/components/forms.jsx` … 入力フォーム（給与/カード/口座）
- `src/components/settings.jsx` … 設定・デザイン設定・要素別書式
- `src/theme.js` … 配色・フォント定義・`DEFAULT_THEME`・`themeVars`・`ovStyle`・編集モード用定数・`TARGET_LABELS`
- `src/utils.js` … 整形関数（yen/num/日付）・データモデル（`ACCOUNT_TYPES`/`acctRole`/`migrateEntry`/`buildStructure`）・初期データ（seed）
- `src/styles.js` … スタイル定義（`styles`）とキーフレーム注入
- `src/storage.js` … 保存層。`window.storage` 互換。既定は localStorage
- `src/main.jsx` … エントリポイント

## データモデル（localStorage / キーは `kakeibo:` 接頭辞）
- `entries` … 記録 `{id, ym:"YYYY-MM", cat:"salary"|"card"|"account", item, account, amount}`
- `cards` … 所有カード `{id, name, brand, note}`
- `debt` … カード残債の月次スケジュール `{cardName:{ym:amount}}`
- `config` … `{accounts[], salaryItems[]}`
- `theme` … デザイン設定（配色/フォント/揃え/要素別オーバーライド `overrides`）

口座の記録種別と収支への算入は `ACCOUNT_TYPES` / `acctRole` を参照
（残高=記録のみ / 預入・受取=収入 / 引出・送金=支出 / 投資振替=符号そのまま収支反映）。

## クラウド同期したい場合
`src/storage.js` の実装を、同じ `get/set/delete/list` の signature のまま
バックエンド（Supabase 等）に差し替えるだけでよい。App.jsx の変更は不要。

## Claude Code での進め方の目安
- まず `App.jsx` を機能単位でファイル分割（Summary / Detail / forms / ThemeEditor / styles）。
- 保存層を実バックエンドへ。
- テスト（Vitest）と型（TypeScript化）を段階的に導入。
