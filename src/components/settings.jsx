import React, { useEffect, useState, useRef } from "react";
import { ACCENT, MUTED, RED, DEFAULT_THEME, ACCENT_PRESETS } from '../theme.js';
import { uid, periodRange } from '../utils';
import { styles } from '../styles.js';
import { getSyncConfig, setSyncConfig, clearSyncConfig, getSyncState, onSyncChange, signUp, signIn, signInUser, signUpUser, displayName, signOut, syncNow } from '../storage.js';

// クラウド同期(Supabase)の設定・ログイン。URL/anon keyは端末のlocalStorageにのみ保存する。
function SyncSection() {
  const [state, setState] = useState({ mode: "loading" });
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const refresh = () => getSyncState().then(setState);
  useEffect(() => {
    refresh();
    return onSyncChange(refresh);
  }, []);
  const syncLabel = state.status === "syncing" ? "同期中…"
    : state.status === "error" ? "同期エラー"
      : state.lastSyncAt ? `最終同期 ${new Date(state.lastSyncAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "自動同期待機中";

  const saveCfg = () => {
    if (!url.trim() || !anonKey.trim()) { setMsg("URLとanon keyを入力してください"); return; }
    setSyncConfig({ url: url.trim(), anonKey: anonKey.trim() }); setMsg(""); refresh();
  };
  const doAuth = async (fn, doneMsg) => {
    setBusy(true); setMsg("");
    try {
      await fn(email.trim(), password);
      setMsg(doneMsg);
      await syncNow();
      setTimeout(() => location.reload(), 600);
    } catch (e) { setMsg("エラー: " + (e.message || e)); } finally { setBusy(false); }
  };
  const doSync = async () => { setBusy(true); setMsg(""); try { await syncNow(); setMsg("同期しました"); setTimeout(() => location.reload(), 600); } catch (e) { setMsg("エラー: " + (e.message || e)); } finally { setBusy(false); } };
  // 個人用: ユーザー名＋PINで同期(メール不要)。fnにsignInUser/signUpUserを渡す。
  const doUser = async (fn, doneMsg) => {
    if (!username.trim()) { setMsg("ユーザー名を入力してください"); return; }
    if (!password || password.length < 6) { setMsg("PINは6桁以上にしてください"); return; }
    setBusy(true); setMsg("");
    try {
      await fn(username, password);
      setMsg(doneMsg);
      await syncNow();
      setTimeout(() => location.reload(), 600);
    } catch (e) { setMsg("エラー: " + (e.message || e)); } finally { setBusy(false); }
  };
  const doSignOut = async () => { await signOut(); refresh(); };
  const unconfigure = () => { if (window.confirm("同期設定を削除します（データは端末に残ります）。よろしいですか？")) { clearSyncConfig(); refresh(); } };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={styles.detailHead}><span>クラウド同期</span></div>
      <div style={styles.detailCard}>
        {(() => { const u = (getSyncConfig() || {}).url; return u ? <div style={{ fontSize: 11.5, color: MUTED, padding: "6px 2px 0", wordBreak: "break-all" }}>接続先（Supabaseのプロジェクト）：<span style={{ color: ACCENT }}>{u}</span></div> : null; })()}
        {msg && <div style={{ ...styles.flash, marginTop: 8 }}>{msg}</div>}
        {state.mode === "loading" && <div style={{ color: MUTED, fontSize: 13, padding: 6 }}>確認中…</div>}
        {state.mode === "off" && (
          <div style={{ padding: "6px 0" }}>
            <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginBottom: 8 }}>SupabaseのプロジェクトURLとanon keyを入力すると、複数端末でデータを同期できます（キーはこの端末にのみ保存）。</div>
            <label style={styles.fieldLabel}>プロジェクトURL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" style={styles.textInput} autoCapitalize="none" />
            <label style={styles.fieldLabel}>anon key</label>
            <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJ..." style={styles.textInput} autoCapitalize="none" />
            <button style={styles.backupBtn} onClick={saveCfg}>同期を設定する</button>
          </div>
        )}
        {state.mode === "signedOut" && (
          <div style={{ padding: "6px 0" }}>
            {state.personal ? (
              <>
                <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7, marginBottom: 10 }}>各端末で<b>同じユーザー名とPIN</b>を入れると同期します（メール不要・端末ごとに最初の1回だけ）。初めてなら「初回登録」、2台目以降は「ログイン」。</div>
                <label style={styles.fieldLabel}>ユーザー名</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例）tora" style={styles.textInput} autoCapitalize="none" autoCorrect="off" />
                <label style={styles.fieldLabel}>PIN（6桁以上）</label>
                <input type="password" inputMode="numeric" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="自分で決める" style={styles.textInput} autoCapitalize="none" />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={{ ...styles.saveBtnHalf, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => doUser(signInUser, "ログインしました。同期中…")}>ログイン</button>
                  <button style={{ ...styles.saveBtnHalf, background: "var(--card-bg)", color: ACCENT, border: `1px solid ${ACCENT}`, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => doUser(signUpUser, "登録しました。同期中…")}>初回登録</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginBottom: 8 }}>{state.builtIn ? "PCとスマホで同じアカウントにログインすると、自動で同期します。" : "設定済み。ログインすると同期が始まります（初回は「新規登録」）。"}</div>
                <label style={styles.fieldLabel}>メールアドレス</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={styles.textInput} autoCapitalize="none" />
                <label style={styles.fieldLabel}>パスワード</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8文字以上" style={styles.textInput} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={{ ...styles.saveBtnHalf, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => doAuth(signIn, "ログインしました。同期中…")}>ログイン</button>
                  <button style={{ ...styles.saveBtnHalf, background: "var(--card-bg)", color: ACCENT, border: `1px solid ${ACCENT}`, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => doAuth(signUp, "登録しました。同期中…")}>新規登録</button>
                </div>
              </>
            )}
            {!state.builtIn && <button style={styles.cancelBtn} onClick={unconfigure}>同期設定を削除</button>}
          </div>
        )}
        {state.mode === "on" && (
          <div style={{ padding: "6px 0" }}>
            <div style={{ fontSize: 13, padding: "4px 2px 8px" }}>ログイン中：<span style={{ color: ACCENT, fontWeight: 600 }}>{displayName(state.email)}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: state.status === "error" ? RED : MUTED, padding: "4px 2px 8px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: state.status === "error" ? RED : state.status === "syncing" ? "#d49b2b" : "var(--income)" }} />
              <span>{syncLabel}</span>
            </div>
            {state.error && <div style={{ fontSize: 11.5, color: RED, padding: "0 2px 4px", wordBreak: "break-word" }}>{state.error}</div>}
            <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6, padding: "0 2px 4px" }}>変更時・アプリ起動時・オンライン復帰時に自動同期します。</div>
            <button style={{ ...styles.backupBtn, opacity: busy || state.status === "syncing" ? 0.5 : 1 }} disabled={busy || state.status === "syncing"} onClick={doSync}>今すぐ同期</button>
            <button style={styles.backupBtn} onClick={doSignOut}>ログアウト</button>
            {!state.builtIn && <button style={styles.cancelBtn} onClick={unconfigure}>同期設定を削除</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// スクショ取込の振り分けルール管理。摘要のキーワード→カード請求/口座記録/スキップ、を登録・編集できる
function ImportRulesSection({ rules, cards, accounts, onSave }) {
  const [edit, setEdit] = useState(null);
  const actionLabel = { card: "カード", account: "口座", skip: "スキップ" };
  const commit = () => {
    if (!edit.match.trim()) return;
    const rule = { ...edit, match: edit.match.trim() };
    const next = edit.id && (rules || []).some((r) => r.id === edit.id) ? rules.map((r) => (r.id === edit.id ? rule : r)) : [...(rules || []), rule];
    onSave(next); setEdit(null);
  };
  const remove = () => { onSave((rules || []).filter((r) => r.id !== edit.id)); setEdit(null); };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={styles.detailHead}><span>スクショ取込のルール</span><button style={styles.addBtn} onClick={() => setEdit({ id: uid(), match: "", action: "card", target: "" })}>＋ 追加</button></div>
      <div style={{ fontSize: 12, color: MUTED, margin: "0 4px 10px", lineHeight: 1.6 }}>摘要にキーワードが含まれる取引を、登録順で先勝ちして自動振り分けします。</div>
      {(rules || []).length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>まだルールがありません。「＋ 追加」または取込時の「覚える」から登録できます。</div></div>
      ) : (
        <div style={styles.detailCard}>
          {(rules || []).map((r) => (
            <button key={r.id} style={styles.settingRow} onClick={() => setEdit({ ...r })}>
              <span style={{ textAlign: "left" }}>「{r.match}」<span style={{ color: MUTED }}>→ {actionLabel[r.action]}{r.target ? `：${r.target}` : ""}</span></span>
              <span style={{ color: MUTED, fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>
      )}
      {edit && (
        <div style={styles.sheetBackdrop} onClick={() => setEdit(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetTitle}>振り分けルール</div>
            <label style={styles.fieldLabel}>キーワード（摘要にこの文字列が含まれたら適用）</label>
            <input value={edit.match} onChange={(e) => setEdit({ ...edit, match: e.target.value })} placeholder="例）ミツビシ" style={styles.textInput} autoFocus />
            <label style={styles.fieldLabel}>振り分け先</label>
            <div style={styles.optionRow}>
              {["card", "account", "skip"].map((v) => (
                <button key={v} style={{ ...styles.optionChip, ...(edit.action === v ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, action: v, target: v === edit.action ? edit.target : "" })}>{actionLabel[v]}</button>
              ))}
            </div>
            {edit.action === "card" && (
              <div style={styles.optionRow}>{(cards || []).map((c) => <button key={c.id} style={{ ...styles.optionChip, ...(edit.target === c.name ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, target: c.name })}>{c.name}</button>)}</div>
            )}
            {edit.action === "account" && (
              <div style={styles.optionRow}>{(accounts || []).map((a) => <button key={a} style={{ ...styles.optionChip, ...(edit.target === a ? styles.optionChipActive : {}) }} onClick={() => setEdit({ ...edit, target: a })}>{a}</button>)}</div>
            )}
            <button style={{ ...styles.saveBtn, opacity: edit.match.trim() && (edit.action === "skip" || edit.target) ? 1 : 0.4 }} disabled={!edit.match.trim() || (edit.action !== "skip" && !edit.target)} onClick={commit}>保存する</button>
            <button style={styles.deleteBtn} onClick={remove}>このルールを削除</button>
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings({ config, onSave, entries, cards, debt, memos, subs, plans, closedMonths, theme, onImport, onOpenDesign, onOpenCards, onRemoveItem }) {
  const [c, setC] = useState(config);
  const [flash, setFlash] = useState("");
  const fileRef = useRef(null);
  useEffect(() => setC(config), [config]);
  const groups = [{ key: "accounts", title: "口座" }, { key: "salaryItems", title: "給与系の項目" }, { key: "memoCategories", title: "メモの分類" }];
  const addItem = (key) => { const name = (prompt(`新しい${groups.find((g) => g.key === key).title}の名前`) || "").trim(); if (!name) return; const next = { ...c, [key]: [...(c[key] || []), name] }; setC(next); onSave(next); };
  const removeItem = (key, i) => onRemoveItem(key, c[key][i]);
  const exportJSON = () => { const blob = new Blob([JSON.stringify({ entries, config: c, cards, debt, memos, subs, plans, closedMonths, theme }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `kakeibo_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); };
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
      <div style={{ color: MUTED, fontSize: 13, margin: "2px 4px 14px", lineHeight: 1.6 }}>口座・給与項目・カードの登録や、取込ルール・同期・バックアップを管理します。</div>

      {/* カード管理への導線 */}
      <button style={styles.navRow} onClick={onOpenCards}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>カード管理</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>所有カードの登録・編集（{(cards || []).length}枚）</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>

      {/* デザイン設定への導線 */}
      <button style={styles.navRow} onClick={onOpenDesign}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>テーマ</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>アクセント色・ダークモード</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>

      {/* 月の締め日(サイクル) */}
      <div style={{ marginBottom: 18 }}>
        <div style={styles.detailHead}><span>月の締め日</span></div>
        <div style={styles.detailCard}>
          <div style={{ fontSize: 12, color: MUTED, padding: "8px 2px 4px", lineHeight: 1.6 }}>
            家計の1ヶ月をこの日で締めます（0＝暦通り）。例）10なら「11日〜翌月10日」を1周期とし、6月度＝6/11〜7/10。給与とそれで払うカードを同じ月にまとめられます。締め日が土日祝なら引き落としは翌営業日にずれるため、その分も自動で同じ周期に含めます（日本の祝日を判定）。スクショ取込は取引日をこの周期へ自動で振り分けます。
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px 8px" }}>
            <span style={{ fontSize: 14 }}>毎月</span>
            <input type="number" inputMode="numeric" min={0} max={28} value={c.cycleCutoffDay ?? 10}
              onChange={(e) => { const v = Math.max(0, Math.min(28, Number(e.target.value) || 0)); const next = { ...c, cycleCutoffDay: v }; setC(next); onSave(next); }}
              style={{ ...styles.textInput, width: 72, textAlign: "center", margin: 0 }} />
            <span style={{ fontSize: 14 }}>日 締め</span>
            {Number(c.cycleCutoffDay) >= 1 && <span style={{ fontSize: 12, color: ACCENT, marginLeft: "auto" }}>例：6月度＝{periodRange("2026-06", c.cycleCutoffDay)}</span>}
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div style={styles.detailHead}><span>{g.title}</span><button style={styles.addBtn} onClick={() => addItem(g.key)}>＋ 追加</button></div>
          <div style={styles.detailCard}>{(c[g.key] || []).map((name, i) => <div key={i} style={styles.settingRow}><span>{name}</span><button style={styles.removeBtn} onClick={() => removeItem(g.key, i)}>削除</button></div>)}</div>
        </div>
      ))}
      <ImportRulesSection rules={c.importRules} cards={cards} accounts={c.accounts} onSave={(rules) => { const next = { ...c, importRules: rules }; setC(next); onSave(next); }} />
      <SyncSection />

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
