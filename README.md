# 家計簿アプリ

React + Vite の家計簿アプリ。ふつうの家計簿と違い「計画を立てて実績と比べる」ことに主眼を置く。
毎月：計画した支出と実際のカード使用額・残高を突き合わせ、「使いすぎ？」「今年いくら残る？」を判断する。
支出の計画は総額1本（固定費＝定期費から自動 ＋ 変動費の見積り）。入力はスクショ取込中心で最小限に。

## 起動
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 本番ビルド → dist/
npm test           # ユニットテスト(Vitest)
```

## 画面（5タブ）
- **今月**（サマリ）… 使いすぎメーター（支出 実績 vs 計画）・年度の着地見込み・口座残高・整合チェック
- **記録** … その月の実績入力（給与/カード/口座・スクショ取込）と見返し（履歴/項目別/表/年間）
- **計画** … 収入・変動費・投資の計画（見通し/計画/差異）。固定費は定期費から自動
- **定期費** … サブスク・通信費などの定期支払い（分類・小計）と分割払い（残債）
- **設定** … 口座/給与項目/カード登録・取込ルール・同期・バックアップ・テーマ・メモ

## 構成（機能ごとに分割済み）
- `src/App.jsx` … アプリのルート（App）とタブバー。旧計画の自動移行もここで実行
- `src/components/summary.jsx` … 今月（使いすぎメーター・年度見込み）
- `src/components/detail.jsx` … 記録（履歴/項目別/表/年間）
- `src/components/plan.jsx` … 計画（`PlanView`：見通し/計画/差異）
- `src/components/recurring.jsx` … 定期費（定期支払い/分割払いの切替）
- `src/components/subs.jsx` … 定期費台帳（`Subs`：分類・月/年換算・更新日）
- `src/components/cards.jsx` … カード一覧・残債（`CardList`/`DebtTable`）
- `src/components/memos.jsx` … 自由メモ（`MemoList`。収支には計上しない）
- `src/components/forms.jsx` … 入力フォーム（給与/カード/口座）と `PickCategory`
- `src/components/import.jsx` … スクショ取込（OCR：tesseract.js を取込時のみ動的読込）
- `src/components/settings.jsx` … 設定・テーマ（`ThemeEditor`：アクセント色/ダークモード）
- `src/icons.jsx` … アプリ内アイコン集
- `src/theme.js` … `DEFAULT_THEME`・`ACCENT_PRESETS`・`themeVars`
- `src/utils.ts` … 整形・データモデル・計画モデル・OCR解析・初期データ（seed）
- `src/styles.js` … スタイル定義とキーフレーム注入
- `src/storage.js` … 保存層。`window.storage` 互換。既定は localStorage
- `src/main.jsx` … エントリポイント

## データモデル（localStorage / キーは `kakeibo:` 接頭辞）
- `entries` … 記録 `{id, ym:"YYYY-MM", cat:"salary"|"card"|"account", item, account, amount}`
- `cards` … 所有カード `{id, name, brand, note, annualFee}`
- `debt` … カード残債（分割払い）の月次スケジュール `{cardName:{ym:{items:[…]}}}`
- `plans` … 計画 `{fyStart, lines:{income|variable|invest:{std, over:{ym:額}}}}`。支出見込み＝固定費（定期費より自動）＋変動費
- `subs` … 定期費 `{id, name, category, amount, cycle:"monthly"|"yearly", card, renewal, plan, note}`
- `memos` … 自由メモ（収支には計上しない）
- `closedMonths` … 記録なしで確定した月の一覧
- `config` … `{accounts[], salaryItems[], accountFlows, memoCategories, importRules}`
- `theme` … テーマ設定 `{accent, dark}`

口座の記録種別と収支への算入は `ACCOUNT_TYPES` / `acctRole` を参照
（残高=記録のみ / 預入・入金=収入 / 引出・出金=支出 / 投資振替=符号そのまま収支反映）。

## クラウド同期（Supabase・実装済み）
`src/storage.js` は localStorage を基本に、設定するとSupabaseへキー単位の
last-write-wins で双方向同期する（オフライン時はローカル→復帰後に追送。
マージ判定は `src/sync.js`）。URL/anon key は端末のlocalStorageにのみ保存し、
リポジトリには置かない。supabase-js は設定時のみ動的読込。

セットアップ（1回だけ）:
1. https://supabase.com で無料プロジェクトを作成
2. Authentication → Sign In / Up → Email を有効化
   （簡単にするなら "Confirm email" はオフ）
3. SQL Editor で以下を実行:
```sql
create table public.kv (
  user_id uuid not null default auth.uid(),
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.kv enable row level security;
create policy "own rows" on public.kv for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
4. アプリの 設定 → クラウド同期 に Project URL と anon key
   （Settings → API）を入力 → 新規登録/ログイン
5. 2台目の端末では同じURL/keyを入れてログインすればデータが揃う

### 端末ごとのURL/key入力を不要にする
GitHub Pagesでは、リポジトリの Settings → Secrets and variables → Actions に
`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、一人用の場合は`VITE_SYNC_OWNER_EMAIL`を登録してください。デプロイ時に
公開接続情報がアプリへ組み込まれ、PC・スマホでは同じメールアドレスとパスワードで
ログインできます。`VITE_SYNC_OWNER_EMAIL`を設定した場合は「同期を開始」を押してメールのリンクを開くだけになります。anon keyはブラウザで利用する公開キーであり、service_role keyは使用しないでください。

ローカル開発では `.env.example` を `.env.local` にコピーして値を設定できます。
ログイン後は変更時、起動時、オンライン復帰時、画面復帰時、および表示中30秒ごとに自動同期します。

## Claude Code での進め方の目安
- デザインの調整は指示ベースで少しずつ（`styles.js` は CSS 変数を参照。色は `theme.js` の `themeVars` で集中管理）。
- 保存層は Supabase 対応済み（上記参照）。
- テスト（Vitest, `src/*.test.ts`）導入済み。コアロジック（`utils.ts`/`sync.ts`）は
  TypeScript化済み（`npm run typecheck`）。コンポーネント（`.jsx`）は当面 untyped の
  ままにしてあるので、型の恩恵を広げたい場合はそちらも段階的に `.tsx` 化するとよい。
