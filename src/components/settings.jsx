import React, { useEffect, useState } from "react";
import { ACCENT, MUTED, RED, FONT_CHOICES, DEFAULT_THEME, TARGET_LABELS } from '../theme.js';
import { styles } from '../styles.js';

export function Settings({ config, onSave, entries, cards, debt, onOpenDesign }) {
  const [c, setC] = useState(config);
  useEffect(() => setC(config), [config]);
  const groups = [{ key: "accounts", title: "口座" }, { key: "salaryItems", title: "給与系の項目" }];
  const addItem = (key) => { const name = (prompt(`新しい${groups.find((g) => g.key === key).title}の名前`) || "").trim(); if (!name) return; const next = { ...c, [key]: [...(c[key] || []), name] }; setC(next); onSave(next); };
  const removeItem = (key, i) => { const next = { ...c, [key]: c[key].filter((_, idx) => idx !== i) }; setC(next); onSave(next); };
  const exportJSON = () => { const blob = new Blob([JSON.stringify({ entries, config: c, cards, debt }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const exportCSV = () => { const lines = ["ym,cat,item,account,amount"]; for (const e of entries) lines.push([e.ym, e.cat, `"${e.item || ""}"`, `"${e.account || ""}"`, e.amount].join(",")); const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); };
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>口座や給与項目を追加できます。カードは「カード」タブで管理します。</div>

      {/* デザイン設定への導線 */}
      <button style={styles.navRow} onClick={onOpenDesign}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>デザイン設定</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>配色・フォント・文字の揃え・表の色など</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div style={styles.detailHead}><span>{g.title}</span><button style={styles.addBtn} onClick={() => addItem(g.key)}>＋ 追加</button></div>
          <div style={styles.detailCard}>{(c[g.key] || []).map((name, i) => <div key={i} style={styles.settingRow}><span>{name}</span><button style={styles.removeBtn} onClick={() => removeItem(g.key, i)}>削除</button></div>)}</div>
        </div>
      ))}
      <div style={{ marginBottom: 8 }}>
        <div style={styles.detailHead}><span>バックアップ</span></div>
        <div style={styles.detailCard}>
          <div style={{ fontSize: 12.5, color: MUTED, padding: "8px 2px", lineHeight: 1.6 }}>クラウドに自動保存されますが、手元にも保存できます。</div>
          <button style={styles.backupBtn} onClick={exportCSV}>CSVで書き出す（Excel用）</button>
          <button style={styles.backupBtn} onClick={exportJSON}>バックアップを保存（復元用）</button>
        </div>
      </div>
    </div>
  );
}

export function ThemeEditor({ theme, onSave, onBack, onToggleEdit }) {
  const set = (k, v) => onSave({ ...theme, [k]: v });
  const colorRow = (k, label) => (
    <div style={styles.themeRow} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{theme[k]}</span>
        <input type="color" value={theme[k]} onChange={(e) => set(k, e.target.value)} style={styles.colorInput} />
      </span>
    </div>
  );
  const sliderRow = (k, label, min, max, unit, step) => (
    <div style={styles.themeRow} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="range" min={min} max={max} step={step || 1} value={theme[k]} onChange={(e) => set(k, parseFloat(e.target.value))} style={{ width: 120, accentColor: ACCENT }} />
        <span style={{ fontSize: 12, color: MUTED, width: 42, textAlign: "right" }}>{theme[k]}{unit}</span>
      </span>
    </div>
  );
  const choiceRow = (k, label, options) => (
    <div style={{ ...styles.themeRow, flexWrap: "wrap", gap: 6 }} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(([v, lbl]) => (
          <button key={v} onClick={() => set(k, v)} style={{ ...styles.alignBtn, ...(theme[k] === v ? styles.alignBtnActive : {}) }}>{lbl}</button>
        ))}
      </span>
    </div>
  );
  const toggleRow = (k, label) => (
    <div style={styles.themeRow} key={k}>
      <span style={styles.themeLabel}>{label}</span>
      <button onClick={() => set(k, !theme[k])} style={{ ...styles.alignBtn, ...(theme[k] ? styles.alignBtnActive : {}) }}>{theme[k] ? "オン" : "オフ"}</button>
    </div>
  );
  const alignRow = (k, label) => choiceRow(k, label, [["left", "左"], ["center", "中央"], ["right", "右"]]);
  const fontOpts = FONT_CHOICES.map((f) => [f.id, f.label]);
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <button style={styles.backLink} onClick={onBack}>‹ 設定にもどる</button>
      <button style={{ ...styles.navRow, marginBottom: 14 }} onClick={onToggleEdit}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>要素ごとに編集（編集モード）</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>画面の各部分をタップして個別に書式設定</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>以下は全体の既定スタイルです。変更はすぐ反映・自動保存されます。</div>

      <div style={styles.themeSection}>フォント</div>
      <div style={styles.detailCard}>
        {choiceRow("font", "全体のフォント", fontOpts)}
        {choiceRow("numFont", "数字のフォント", fontOpts)}
        {sliderRow("baseSize", "文字の基本サイズ", 12, 18, "px")}
        {choiceRow("heavy", "見出しの太さ", [[600, "普通"], [700, "太い"], [800, "極太"], [900, "最太"]])}
        {sliderRow("tracking", "字間", -0.5, 2, "px", 0.1)}
        {toggleRow("tabularNums", "数字を等幅にそろえる")}
      </div>

      <div style={styles.themeSection}>配色</div>
      <div style={styles.detailCard}>
        {colorRow("accent", "アクセント（緑）")}
        {colorRow("income", "収入の色")}
        {colorRow("expense", "支出の色")}
        {colorRow("ink", "文字の色")}
        {colorRow("paper", "背景の色")}
        {colorRow("muted", "補助文字の色")}
        {colorRow("line", "罫線の色")}
        {colorRow("heroBg", "サマリ上部の背景")}
        {colorRow("heroText", "サマリ上部の文字")}
      </div>

      <div style={styles.themeSection}>表・一覧の色</div>
      <div style={styles.detailCard}>
        {colorRow("cardBg", "カード/セルの背景")}
        {colorRow("thBg", "表の見出し背景")}
        {colorRow("groupBg", "グループ見出し背景")}
        {colorRow("acctBg", "口座見出し背景")}
        {colorRow("subtotalBg", "小計行の背景")}
        {colorRow("totalCellBg", "合計列の背景")}
      </div>

      <div style={styles.themeSection}>タブバー</div>
      <div style={styles.detailCard}>
        {colorRow("tabBg", "タブバーの背景")}
        {colorRow("tabActive", "選択中タブの色")}
      </div>

      <div style={styles.themeSection}>文字の揃え方</div>
      <div style={styles.detailCard}>
        {alignRow("numAlign", "数字の揃え")}
        {alignRow("labelAlign", "項目名の揃え")}
      </div>

      <div style={styles.themeSection}>サイズ・余白</div>
      <div style={styles.detailCard}>
        {sliderRow("radius", "角の丸み", 0, 24, "px")}
        {sliderRow("rowPad", "行の高さ", 6, 20, "px")}
        {sliderRow("numSize", "数字の大きさ", 12, 22, "px")}
      </div>

      <button style={{ ...styles.backupBtn, marginTop: 16, color: RED, borderColor: "#E7C9C0" }} onClick={() => onSave({ ...DEFAULT_THEME })}>初期設定に戻す</button>
    </div>
  );
}

export function FormatSheet({ id, theme, onSave, onClose }) {
  const ov = (theme.overrides && theme.overrides[id]) || {};
  const setOv = (patch) => {
    const next = { ...ov, ...patch };
    Object.keys(next).forEach((k) => { if (next[k] === "" || next[k] == null) delete next[k]; });
    onSave({ ...theme, overrides: { ...(theme.overrides || {}), [id]: next } });
  };
  const label = TARGET_LABELS[id] || "この要素";
  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>{label}の書式</div>

        <label style={styles.fieldLabel}>文字の揃え</label>
        <div style={styles.kindRow}>
          {[["", "既定"], ["left", "左"], ["center", "中央"], ["right", "右"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.kindBtn, ...((ov.align || "") === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : {}) }} onClick={() => setOv({ align: v })}>{l}</button>
          ))}
        </div>

        <label style={styles.fieldLabel}>太さ</label>
        <div style={styles.kindRow}>
          {[["", "既定"], [400, "細"], [600, "中"], [700, "太"], [800, "極太"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.kindBtn, ...((ov.weight || "") === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : {}) }} onClick={() => setOv({ weight: v })}>{l}</button>
          ))}
        </div>

        <div style={styles.fmtGrid}>
          <div>
            <label style={styles.fieldLabel}>文字サイズ</label>
            <div style={styles.fmtCell}>
              <input type="range" min={10} max={40} value={ov.size || 15} onChange={(e) => setOv({ size: parseInt(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} />
              <span style={{ fontSize: 12, color: MUTED, width: 34, textAlign: "right" }}>{ov.size || "既定"}</span>
            </div>
          </div>
        </div>

        <div style={styles.fmtGrid}>
          <div style={{ flex: 1 }}>
            <label style={styles.fieldLabel}>角丸</label>
            <div style={styles.fmtCell}><input type="range" min={0} max={30} value={ov.radius != null ? ov.radius : 0} onChange={(e) => setOv({ radius: parseInt(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} /><span style={{ fontSize: 11, color: MUTED, width: 30, textAlign: "right" }}>{ov.radius != null ? ov.radius : "既定"}</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.fieldLabel}>余白</label>
            <div style={styles.fmtCell}><input type="range" min={0} max={30} value={ov.pad != null ? ov.pad : 8} onChange={(e) => setOv({ pad: parseInt(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} /><span style={{ fontSize: 11, color: MUTED, width: 30, textAlign: "right" }}>{ov.pad != null ? ov.pad : "既定"}</span></div>
          </div>
        </div>

        <label style={styles.fieldLabel}>字間</label>
        <div style={styles.fmtCell}><input type="range" min={-1} max={4} step={0.1} value={ov.tracking != null ? ov.tracking : 0} onChange={(e) => setOv({ tracking: parseFloat(e.target.value) })} style={{ flex: 1, accentColor: ACCENT }} /><span style={{ fontSize: 11, color: MUTED, width: 34, textAlign: "right" }}>{ov.tracking != null ? ov.tracking : "既定"}</span></div>

        <div style={styles.fmtGrid}>
          <div>
            <label style={styles.fieldLabel}>文字色</label>
            <div style={styles.fmtCell}><input type="color" value={ov.color || "#1C2321"} onChange={(e) => setOv({ color: e.target.value })} style={styles.colorInput} /><button style={styles.miniClear} onClick={() => setOv({ color: "" })}>既定</button></div>
          </div>
          <div>
            <label style={styles.fieldLabel}>背景色</label>
            <div style={styles.fmtCell}><input type="color" value={ov.bg || "#FFFFFF"} onChange={(e) => setOv({ bg: e.target.value })} style={styles.colorInput} /><button style={styles.miniClear} onClick={() => setOv({ bg: "" })}>既定</button></div>
          </div>
          <div>
            <label style={styles.fieldLabel}>罫線色</label>
            <div style={styles.fmtCell}><input type="color" value={ov.borderColor || "#E4E1D9"} onChange={(e) => setOv({ borderColor: e.target.value })} style={styles.colorInput} /><button style={styles.miniClear} onClick={() => setOv({ borderColor: "", borderWidth: "" })}>既定</button></div>
          </div>
        </div>

        <button style={styles.deleteBtn} onClick={() => { const o = { ...(theme.overrides || {}) }; delete o[id]; onSave({ ...theme, overrides: o }); onClose(); }}>この要素の書式をリセット</button>
        <button style={styles.saveBtn} onClick={onClose}>完了</button>
      </div>
    </div>
  );
}
