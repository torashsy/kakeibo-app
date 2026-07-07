// 色はCSS変数を参照(テーマで差し替え可能)。フォールバック値も持たせる。
export const ACCENT = "var(--accent)", ACCENT_SOFT = "var(--accent-soft)", INK = "var(--ink)", PAPER = "var(--paper)";

export const LINE = "var(--line)", MUTED = "var(--muted)", RED = "var(--expense)", GREEN = "var(--income)";


// 全体で使う1つのフォントスタック(以前の「フォント選択」機能は廃止)
const FONT_STACK = "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif";


// ユーザーが選べるのは「アクセント色」と「ダークモード」だけ。
// ダークを基本(既定)とする。
export const DEFAULT_THEME = {
  accent: "#1F8A66",
  dark: true,
};

// アクセント色のプリセット(設定画面で選べる)。
// 白文字が乗るヒーロー等でも読めるよう、やや深めの発色に統一。
export const ACCENT_PRESETS = [
  { id: "emerald", label: "エメラルド", color: "#1F8A66" },
  { id: "teal", label: "ティール", color: "#1C8A93" },
  { id: "blue", label: "ブルー", color: "#2F6FBF" },
  { id: "indigo", label: "インディゴ", color: "#5257C7" },
  { id: "violet", label: "バイオレット", color: "#8A57C2" },
  { id: "rose", label: "ローズ", color: "#C24368" },
];


// --- 色ユーティリティ ---------------------------------------------------
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const rgbToHex = (r, g, b) => "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
// a を b に t(0..1) だけ混ぜる
const mix = (a, b, t) => { const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b); return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t); };


// アクセント色 + ダーク/ライトから、画面全体のパレット(CSS変数)を生成する
export const themeVars = (t) => {
  const accent = (t && t.accent) || DEFAULT_THEME.accent;
  const dark = !!(t && t.dark);
  const WHITE = "#FFFFFF";

  // ベージュ系をやめ、クールでニュートラルなグレーを基調にする(ダーク基本)
  const p = dark
    ? {
        paper: "#0F1216", ink: "#EAECEF", line: "#262B31", muted: "#868E99",
        cardBg: "#171B20", thBg: "#1C2127", groupBg: "#21272E",
        subtotalBg: "#1A1F25", totalCellBg: "#181D22", tabBg: "#12161A",
        base: "#0F1216",
        income: mix(accent, WHITE, 0.26), expense: "#F2765C",
        accentSoft: mix(accent, "#0F1216", 0.78),
        acctBg: mix(accent, "#0F1216", 0.85),
        colHl: mix(accent, "#0F1216", 0.82),        // 年間表の「今月」列の淡いハイライト
        zero: "#4A515A",                             // 0円セルの控えめな文字色
        expenseSoft: mix("#F2765C", "#0F1216", 0.82), // 警告カードの背景
      }
    : {
        paper: "#F6F7F9", ink: "#171A1D", line: "#E2E5EA", muted: "#626973",
        cardBg: "#FFFFFF", thBg: "#EEF0F3", groupBg: "#E5E8EC",
        subtotalBg: "#EDEFF2", totalCellBg: "#F6F7F9", tabBg: "#FFFFFF",
        base: "#FFFFFF",
        income: accent, expense: "#CE3B2C",
        accentSoft: mix(accent, WHITE, 0.88),
        acctBg: mix(accent, WHITE, 0.92),
        colHl: mix(accent, WHITE, 0.92),
        zero: "#B7BCC3",
        expenseSoft: mix("#CE3B2C", WHITE, 0.90),
      };

  return {
    "--accent": accent, "--accent-soft": p.accentSoft, "--ink": p.ink, "--paper": p.paper,
    "--line": p.line, "--muted": p.muted, "--income": p.income, "--expense": p.expense,
    "--card-bg": p.cardBg, "--th-bg": p.thBg, "--group-bg": p.groupBg, "--acct-bg": p.acctBg,
    "--subtotal-bg": p.subtotalBg, "--total-cell-bg": p.totalCellBg,
    "--col-hl": p.colHl, "--zero": p.zero, "--expense-soft": p.expenseSoft,
    "--num-align": "right", "--label-align": "left",
    "--radius": "14px", "--row-pad": "12px", "--num-size": "15px",
    "--hero-bg": accent, "--hero-text": "#FFFFFF",
    "--font": FONT_STACK, "--num-font": FONT_STACK,
    "--base-size": "15px", "--heavy": 600, "--tracking": "0px",
    "--tab-bg": p.tabBg, "--tab-active": accent,
    "--num-variant": "tabular-nums",
    colorScheme: dark ? "dark" : "light",
  };
};
