// 色はCSS変数を参照(テーマで差し替え可能)。フォールバック値も持たせる。
export const ACCENT = "var(--accent)", ACCENT_SOFT = "var(--accent-soft)", INK = "var(--ink)", PAPER = "var(--paper)";

export const LINE = "var(--line)", MUTED = "var(--muted)", RED = "var(--expense)", GREEN = "var(--income)";


// ユーザーが細かく調整できるデザイン設定
export const FONT_CHOICES = [
  { id: "gothic", label: "ゴシック", stack: "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif" },
  { id: "mincho", label: "明朝", stack: "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif" },
  { id: "maru", label: "丸ゴシック", stack: "'Hiragino Maru Gothic ProN','Rounded Mplus 1c',sans-serif" },
  { id: "system", label: "システム", stack: "system-ui,-apple-system,sans-serif" },
  { id: "mono", label: "等幅", stack: "'SF Mono','Consolas',monospace" },
];

export const fontStack = (id) => (FONT_CHOICES.find((f) => f.id === id) || FONT_CHOICES[0]).stack;


export const DEFAULT_THEME = {
  accent: "#2F6F5B", accentSoft: "#E6F0EC", ink: "#1C2321", paper: "#FBFAF7",
  line: "#E4E1D9", muted: "#8A8577", income: "#2F6F5B", expense: "#B5462F",
  cardBg: "#FFFFFF",
  thBg: "#F7F5EF", groupBg: "#EDEAE2", acctBg: "#F1F5F3", subtotalBg: "#F4F1EA", totalCellBg: "#FAF9F5",
  numAlign: "right", labelAlign: "left",
  radius: 14, rowPad: 12, numSize: 15,
  heroBg: "#2F6F5B", heroText: "#FFFFFF",
  font: "gothic", numFont: "gothic", baseSize: 15, heavy: 800, tracking: 0,
  tabBg: "#FFFFFF", tabActive: "#2F6F5B",
  tabularNums: true,
  overrides: {},  // 要素別の書式上書き { targetId: {align,color,size,weight,bg} }
};


// 要素別オーバーライドをCSSに変換
export const ovStyle = (ov) => {
  if (!ov) return {};
  const s = {};
  if (ov.align) s.textAlign = ov.align;
  if (ov.color) s.color = ov.color;
  if (ov.size) s.fontSize = ov.size + "px";
  if (ov.weight) s.fontWeight = ov.weight;
  if (ov.bg) s.background = ov.bg;
  if (ov.justify) s.justifyContent = ov.justify;
  if (ov.radius != null) s.borderRadius = ov.radius + "px";
  if (ov.pad != null) s.padding = ov.pad + "px";
  if (ov.tracking != null) s.letterSpacing = ov.tracking + "px";
  if (ov.borderColor) s.border = `${ov.borderWidth != null ? ov.borderWidth : 1}px solid ${ov.borderColor}`;
  return s;
};

// 編集モードで要素を囲む点線
export const EDIT_OUTLINE = { outline: "1.5px dashed #B58B4F", outlineOffset: 1, cursor: "pointer", borderRadius: 4 };

// 子要素で覆われるコンテナは、角のチップから選べるようにする
export const CONTAINER_IDS = new Set(["hero.bg", "sum.bg", "card.bg", "app.bg"]);

export const themeVars = (t) => ({
  "--accent": t.accent, "--accent-soft": t.accentSoft, "--ink": t.ink, "--paper": t.paper,
  "--line": t.line, "--muted": t.muted, "--income": t.income, "--expense": t.expense,
  "--card-bg": t.cardBg, "--th-bg": t.thBg, "--group-bg": t.groupBg, "--acct-bg": t.acctBg,
  "--subtotal-bg": t.subtotalBg, "--total-cell-bg": t.totalCellBg,
  "--num-align": t.numAlign, "--label-align": t.labelAlign,
  "--radius": t.radius + "px", "--row-pad": t.rowPad + "px", "--num-size": t.numSize + "px",
  "--hero-bg": t.heroBg, "--hero-text": t.heroText,
  "--font": fontStack(t.font), "--num-font": fontStack(t.numFont),
  "--base-size": (t.baseSize || 15) + "px", "--heavy": t.heavy, "--tracking": (t.tracking || 0) + "px",
  "--tab-bg": t.tabBg, "--tab-active": t.tabActive,
  "--num-variant": t.tabularNums ? "tabular-nums" : "normal",
});


export const TARGET_LABELS = {
  "hero.bg": "サマリ上部の背景", "sum.bg": "集計セルの背景", "card.bg": "残高カードの背景",
  "bal.row": "残高の行", "app.bg": "全体の背景", "card.acctHead": "口座の見出し", "card.groupHead": "グループ見出し",
  "table.th": "表の見出し", "table.group": "表のグループ見出し", "table.acct": "表の口座見出し",
  "table.subtotal": "表の小計", "table.rowlabel": "表の項目名", "table.cell": "表の数値セル", "table.totalcell": "表の合計セル",
  "hero.value": "収支の金額", "hero.label": "「今月の収支」見出し", "hero.sub": "収支の内訳",
  "sum.cell": "サマリの4セル", "bal.row": "残高の行", "sec.title": "見出し",
  "detail.item": "項目名", "detail.total": "項目の金額", "detail.subtotal": "小計行",
  "table.th": "表の見出し", "table.group": "表のグループ見出し", "themeSection": "見出し",
};
