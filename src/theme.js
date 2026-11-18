// 色はCSS変数を参照(テーマで差し替え可能)。フォールバック値も持たせる。
export const ACCENT = "var(--accent)", ACCENT_SOFT = "var(--accent-soft)", INK = "var(--ink)", PAPER = "var(--paper)";

export const LINE = "var(--line)", MUTED = "var(--muted)", RED = "var(--expense)", GREEN = "var(--income)";


// 全体で使う1つのフォントスタック(以前の「フォント選択」機能は廃止)
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Yu Gothic UI',Meiryo,sans-serif";


// ユーザーが選べるのは「アクセント色」と「ダークモード」だけ。
// 保存済みのテーマを優先する。
export const DEFAULT_THEME = {
  accent: "#007AFF",
  dark: false,
};

// アクセント色のプリセット(設定画面で選べる)。
// 白文字が乗るヒーロー等でも読めるよう、やや深めの発色に統一。
export const ACCENT_PRESETS = [
  { id: "emerald", label: "エメラルド", color: "#295C59" },
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
  const selectedAccent = (t && t.accent) || DEFAULT_THEME.accent;
  const accent = selectedAccent.toUpperCase() === "#295C59" ? "#007AFF" : selectedAccent;
  const dark = !!(t && t.dark);
  const WHITE = "#FFFFFF";

  const p = dark
    ? {
        paper: "#000000", ink: "#F5F5F7", line: "#38383A", muted: "#AEAEB2",
        cardBg: "#1C1C1E", thBg: "#2C2C2E", groupBg: "#2C2C2E",
        subtotalBg: "#1A1F25", totalCellBg: "#181D22", tabBg: "#12161A",
        base: "#000000",
        income: "#64A8FF", expense: "#FF6961",
        accentSoft: mix(accent, "#111419", 0.78),
        acctBg: mix(accent, "#111419", 0.85),
        colHl: mix(accent, "#111419", 0.82),        // 年間表の「今月」列の淡いハイライト
        zero: "#4A515A",                             // 0円セルの控えめな文字色
        expenseSoft: mix("#F2765C", "#111419", 0.82), // 警告カードの背景
      }
    : {
        paper: "#F2F2F7", ink: "#1C1C1E", line: "#D1D1D6", muted: "#68686D",
        cardBg: "#FFFFFF", thBg: "#EEF0F3", groupBg: "#EDEFF2",
        subtotalBg: "#EDEFF2", totalCellBg: "#F6F7F9", tabBg: "#F8FAFC",
        base: "#FFFFFF",
        income: "#0066CC", expense: "#B3261E",
        accentSoft: mix(accent, WHITE, 0.88),
        acctBg: mix(accent, WHITE, 0.92),
        colHl: mix(accent, WHITE, 0.92),
        zero: "#B7BCC3",
        expenseSoft: mix("#94483D", WHITE, 0.90),
      };

  return {
    "--accent": accent, "--accent-soft": p.accentSoft, "--ink": p.ink, "--paper": p.paper,
    "--line": p.line, "--muted": p.muted, "--income": p.income, "--expense": p.expense,
    "--chart-ink": dark ? "#64A8FF" : "#007AFF",
    "--projection-bg": dark ? mix(accent, "#15211E", 0.70) : mix(accent, "#F6F8F4", 0.9),
    "--hairline": dark ? "#FFFFFF1F" : "#1B243314",
    "--control-bg": dark ? "#2C2C2E" : "#E5E5EA",
    "--selected-control": dark ? "#636366" : "#FFFFFF",
    "--nav-glass": dark ? "rgba(36,36,38,.94)" : "rgba(255,255,255,.94)",
    "--card-bg": p.cardBg, "--th-bg": p.thBg, "--group-bg": p.groupBg, "--acct-bg": p.acctBg,
    "--subtotal-bg": p.subtotalBg, "--total-cell-bg": p.totalCellBg,
    "--col-hl": p.colHl, "--zero": p.zero, "--expense-soft": p.expenseSoft,
    "--num-align": "right", "--label-align": "left",
    "--radius": "0px", "--row-pad": "12px", "--num-size": "15px",
    "--hero-bg": accent, "--hero-text": "#FFFFFF",
    "--font": FONT_STACK, "--num-font": FONT_STACK,
    "--base-size": "15px", "--heavy": 600, "--tracking": "0px",
    "--tab-bg": p.tabBg, "--tab-active": accent,
    "--num-variant": "tabular-nums",
    colorScheme: dark ? "dark" : "light",
  };
};
