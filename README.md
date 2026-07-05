# 家計簿アプリ

React + Vite の家計簿アプリ。3カテゴリ入力（給与系/カード/口座）、カード残債・一覧管理、
項目別/表/年間の集計、要素ごとのデザイン編集モードを備える。

## 起動
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 本番ビルド → dist/
```

## 構成
- `src/App.jsx` … アプリ本体（UI・集計・デザイン設定すべて）
- `src/storage.js` … 保存層。`window.storage` 互換。既定は localStorage。
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
