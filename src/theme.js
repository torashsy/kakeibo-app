// 色はCSS変数を参照(テーマで差し替え可能)。フォールバック値も持たせる。
export const ACCENT = "var(--accent)", ACCENT_SOFT = "var(--accent-soft)", INK = "var(--ink)", PAPER = "var(--paper)";

export const LINE = "var(--line)", MUTED = "var(--muted)", RED = "var(--expense)", GREEN = "var(--income)";


// 全体で使う1つのフォントスタック(以前の「フォント選択」機能は廃止)
const FONT_STACK = "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif";


// ユーザーが選べるのは「アクセント色」と「ダークモード」だけ
export const DEFAULT_THEME = {
  accent: "#2F6F5B",
  dark: false,
};

// アクセント色のプリセット(設定画面で選べる)
export const ACCENT_PRESETS = [
  { id: "green", label: "グリーン", color: "#2F6F5B" },
  { id: "blue", label: "ブルー", color: "#2F5D8A" },
  { id: "indigo", label: "インディゴ", color: "#4B4E8A" },
  { id: "plum", label: "プラム", color: "#8A3F66" },
  { id: "terra", label: "テラコッタ", color: "#B5563A" },
  { id: "graphite", label: "グラファイト", color: "#3A3F45" },
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

  const p = dark
    ? {
        paper: "#16181A", ink: "#E9E7E1", line: "#34383C", muted: "#9A968C",
        cardBg: "#22262A", thBg: "#2A2E32", groupBg: "#2E3338",
        subtotalBg: "#262B2E", totalCellBg: "#23282B", tabBg: "#1B1E20",
        base: "#16181A",
        income: mix(accent, WHITE, 0.28), expense: "#E0765C",
        accentSoft: mix(accent, "#16181A", 0.74),
        acctBg: mix(accent, "#16181A", 0.82),
      }
    : {
        paper: "#FBFAF7", ink: "#1C2321", line: "#E4E1D9", muted: "#8A8577",
        cardBg: "#FFFFFF", thBg: "#F7F5EF", groupBg: "#EDEAE2",
        subtotalBg: "#F4F1EA", totalCellBg: "#FAF9F5", tabBg: "#FFFFFF",
        base: "#FFFFFF",
        income: accent, expense: "#B5462F",
        accentSoft: mix(accent, WHITE, 0.86),
        acctBg: mix(accent, WHITE, 0.90),
      };

  return {
    "--accent": accent, "--accent-soft": p.accentSoft, "--ink": p.ink, "--paper": p.paper,
    "--line": p.line, "--muted": p.muted, "--income": p.income, "--expense": p.expense,
    "--card-bg": p.cardBg, "--th-bg": p.thBg, "--group-bg": p.groupBg, "--acct-bg": p.acctBg,
    "--subtotal-bg": p.subtotalBg, "--total-cell-bg": p.totalCellBg,
    "--num-align": "right", "--label-align": "left",
    "--radius": "14px", "--row-pad": "12px", "--num-size": "15px",
    "--hero-bg": accent, "--hero-text": "#FFFFFF",
    "--font": FONT_STACK, "--num-font": FONT_STACK,
    "--base-size": "15px", "--heavy": 800, "--tracking": "0px",
    "--tab-bg": p.tabBg, "--tab-active": accent,
    "--num-variant": "tabular-nums",
    colorScheme: dark ? "dark" : "light",
  };
};
