# 家計簿アプリ

React + Vite の家計簿アプリ。3カテゴリ入力（給与系/カード/口座）、カード残債・一覧管理、
項目別/表/年間の集計、テーマ（アクセント色・ダークモード）を備える。

## 起動
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 本番ビルド → dist/
npm test           # ユニットテスト(Vitest)
```

## 構成（機能ごとに分割済み）
- `src/App.jsx` … アプリのルート（App）とタブバー（TabBtn）
- `src/edit.jsx` … `Editable`（`base` をそのまま描画する互換用の器。旧デザイン編集モードの名残）
- `src/components/summary.jsx` … サマリ画面
- `src/components/detail.jsx` … 詳細（履歴/項目別/表/年間・貯蓄率グラフ）
- `src/components/cards.jsx` … カード（残債/一覧）
- `src/components/forms.jsx` … 入力フォーム（給与/カード/口座）
- `src/components/settings.jsx` … 設定・テーマ（`ThemeEditor`：アクセント色/ダークモード）
- `src/theme.js` … `DEFAULT_THEME`（`{accent, dark}`）・`ACCENT_PRESETS`・`themeVars`（アクセント色+明暗から全パレットを生成）
- `src/utils.js` … 整形関数（yen/num/日付）・データモデル（`ACCOUNT_TYPES`/`acctRole`/`migrateEntry`/`buildStructure`）・初期データ（seed）
- `src/styles.js` … スタイル定義（`styles`）とキーフレーム注入
- `src/storage.js` … 保存層。`window.storage` 互換。既定は localStorage
- `src/main.jsx` … エントリポイント

## データモデル（localStorage / キーは `kakeibo:` 接頭辞）
- `entries` … 記録 `{id, ym:"YYYY-MM", cat:"salary"|"card"|"account", item, account, amount}`
- `cards` … 所有カード `{id, name, brand, note}`
- `debt` … カード残債の月次スケジュール `{cardName:{ym:amount}}`
- `config` … `{accounts[], salaryItems[]}`
- `theme` … テーマ設定 `{accent, dark}`（アクセント色・ダークモード）

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
