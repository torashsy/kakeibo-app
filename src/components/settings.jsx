import React, { useEffect, useState, useRef } from "react";
import { ACCENT, MUTED, RED, DEFAULT_THEME, ACCENT_PRESETS } from '../theme.js';
import { styles } from '../styles.js';

export function Settings({ config, onSave, entries, cards, debt, memos, subs, plans, theme, onImport, onOpenDesign, onRemoveItem }) {
  const [c, setC] = useState(config);
  const [flash, setFlash] = useState("");
  const fileRef = useRef(null);
  useEffect(() => setC(config), [config]);
  const groups = [{ key: "accounts", title: "口座" }, { key: "salaryItems", title: "給与系の項目" }];
  const addItem = (key) => { const name = (prompt(`新しい${groups.find((g) => g.key === key).title}の名前`) || "").trim(); if (!name) return; const next = { ...c, [key]: [...(c[key] || []), name] }; setC(next); onSave(next); };
  const removeItem = (key, i) => onRemoveItem(key, c[key][i]);
  const exportJSON = () => { const blob = new Blob([JSON.stringify({ entries, config: c, cards, debt, memos, subs, plans, theme }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d || typeof d !== "object" || (!Array.isArray(d.entries) && !d.config && !Array.isArray(d.cards))) { alert("バックアップファイルの形式が違います。"); return; }
        const parts = [];
        if (Array.isArray(d.entries)) parts.push(`記録${d.entries.length}件`);
        if (Array.isArray(d.cards)) parts.push(`カード${d.cards.length}枚`);
        if (Array.isArray(d.memos)) parts.push(`メモ${d.memos.length}件`);
        if (Array.isArray(d.subs)) parts.push(`サブスク${d.subs.length}件`);
        if (d.plans) parts.push("計画");
        if (!window.confirm(`${parts.join("・")}を読み込みます。現在のデータは上書きされます。よろしいですか？`)) return;
        onImport(d);
        setFlash("バックアップから復元しました");
        setTimeout(() => setFlash(""), 3000);
      } catch { alert("ファイルを読み込めませんでした。JSONバックアップを選んでください。"); }
    };
    reader.readAsText(file);
  };
  const exportCSV = () => { const lines = ["ym,cat,item,account,amount"]; for (const e of entries) lines.push([e.ym, e.cat, `"${e.item || ""}"`, `"${e.account || ""}"`, e.amount].join(",")); const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); };
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>口座や給与項目を追加できます。カードは「カード」タブで管理します。</div>

      {/* デザイン設定への導線 */}
      <button style={styles.navRow} onClick={onOpenDesign}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>テーマ</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>アクセント色・ダークモード</span>
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
          {flash && <div style={{ ...styles.flash, marginTop: 8 }}>✓ {flash}</div>}
          <div style={{ fontSize: 12.5, color: MUTED, padding: "8px 2px", lineHeight: 1.6 }}>記録・カード・メモ・サブスク・計画・テーマをまとめて保存/復元できます。</div>
          <button style={styles.backupBtn} onClick={exportCSV}>CSVで書き出す（Excel用）</button>
          <button style={styles.backupBtn} onClick={exportJSON}>バックアップを保存（復元用）</button>
          <button style={styles.backupBtn} onClick={() => fileRef.current && fileRef.current.click()}>バックアップから復元</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) importJSON(f); e.target.value = ""; }} />
        </div>
      </div>
    </div>
  );
}

export function ThemeEditor({ theme, onSave, onBack }) {
  const set = (k, v) => onSave({ ...theme, [k]: v });
  const isCustom = !ACCENT_PRESETS.some((p) => p.color.toLowerCase() === (theme.accent || "").toLowerCase());
  return (
    <div style={{ padding: "4px 2px 8px" }}>
      <button style={styles.backLink} onClick={onBack}>‹ 設定にもどる</button>
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>変更はすぐ反映・自動保存されます。</div>

      <div style={styles.themeSection}>表示モード</div>
      <div style={styles.detailCard}>
        <div style={styles.themeRow}>
          <span style={styles.themeLabel}>ダークモード</span>
          <button onClick={() => set("dark", !theme.dark)} style={{ ...styles.alignBtn, ...(theme.dark ? styles.alignBtnActive : {}) }}>{theme.dark ? "オン" : "オフ"}</button>
        </div>
      </div>

      <div style={styles.themeSection}>アクセント色</div>
      <div style={styles.detailCard}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 2px" }}>
          {ACCENT_PRESETS.map((p) => {
            const active = p.color.toLowerCase() === (theme.accent || "").toLowerCase();
            return (
              <button key={p.id} onClick={() => set("accent", p.color)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: p.color, boxShadow: active ? `0 0 0 3px var(--paper), 0 0 0 5px ${p.color}` : "none" }} />
                <span style={{ fontSize: 11, color: active ? ACCENT : MUTED, fontWeight: active ? 700 : 500 }}>{p.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ ...styles.themeRow, borderBottom: "none" }}>
          <span style={styles.themeLabel}>自由に選ぶ{isCustom ? "（適用中）" : ""}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{theme.accent}</span>
            <input type="color" value={theme.accent} onChange={(e) => set("accent", e.target.value)} style={styles.colorInput} />
          </span>
        </div>
      </div>

      <button style={{ ...styles.backupBtn, marginTop: 16, color: RED, border: "1px solid #E7C9C0" }} onClick={() => onSave({ ...DEFAULT_THEME })}>初期設定に戻す</button>
    </div>
  );
}
