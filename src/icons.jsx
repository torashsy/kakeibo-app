import React from "react";

// アプリ内アイコンを1か所に集約したラインアイコン集。
// すべて 24x24 / stroke=currentColor / 太さ共通で、絵文字混在による不揃いをなくす。
// 色は親要素の color を継承する(タブは選択色、ピッカーは白丸の上に白線)。
const ICONS = {
  // サマリ … 収支の概観(棒グラフ)
  summary: (
    <>
      <line x1="5" y1="21" x2="5" y2="13" />
      <line x1="12" y1="21" x2="12" y2="4" />
      <line x1="19" y1="21" x2="19" y2="9" />
    </>
  ),
  // 詳細 … 項目の一覧(箇条書き)
  detail: (
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  // カード … クレジットカード
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <line x1="2.5" y1="10" x2="21.5" y2="10" />
      <line x1="6" y1="15" x2="10" y2="15" />
    </>
  ),
  // 設定 … 歯車
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  // メモ … 書類(ファイル+行)
  memo: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="16.5" x2="13.5" y2="16.5" />
    </>
  ),
  // 給与系 … 円マーク(収入)
  yen: (
    <>
      <path d="M8 7l4 5 4-5" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="9" y1="13.5" x2="15" y2="13.5" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </>
  ),
  // 口座 … 銀行
  bank: (
    <>
      <path d="M3 20.5h18" />
      <path d="M5 20.5V10M9.7 20.5V10M14.3 20.5V10M19 20.5V10" />
      <path d="M3.5 10L12 4l8.5 6" />
    </>
  ),
  // スクショ取込 … カメラ
  camera: (
    <>
      <path d="M4 8h3l1.6-2.5h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8z" />
      <circle cx="12" cy="14" r="3.5" />
    </>
  ),
  // 計画 … カレンダーにチェック(先を見立てる)
  plan: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
      <path d="M8.5 14.5l2.3 2.3 4.2-4.4" />
    </>
  ),
  // 定期費 … 繰り返し(循環矢印)
  recurring: (
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12A8 8 0 0 1 17.7 6.4" />
      <path d="M17.5 3v3.6h-3.6" />
      <path d="M6.5 21v-3.6h3.6" />
    </>
  ),
};

export function Icon({ name, size = 22, strokeWidth = 1.8, style }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", ...style }}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}
