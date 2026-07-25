import React, { useEffect, useState, useRef } from "react";
import { ACCENT, MUTED, RED, DEFAULT_THEME, ACCENT_PRESETS } from '../theme.js';
import { uid, periodRange, findInternalTransfers, INTERNAL_TRANSFER_ITEM, yen, verifyCycles, periodLabel, cycleEndDate } from '../utils';
import { styles } from '../styles.js';
import { setSyncConfig, clearSyncConfig, getSyncState, onSyncChange, signUp, signIn, signInUser, signUpUser, displayName, signOut, syncNow } from '../storage.js';

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
      : state.lastSyncAt ? `同期 ${new Date(state.lastSyncAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "待機";

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
        {msg && <div style={{ ...styles.flash, marginTop: 8 }}>{msg}</div>}
        {state.mode === "loading" && <div style={{ color: MUTED, fontSize: 13, padding: 6 }}>確認中…</div>}
        {state.mode === "off" && (
          <div style={{ padding: "6px 0" }}>
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
            <button style={{ ...styles.backupBtn, opacity: busy || state.status === "syncing" ? 0.5 : 1 }} disabled={busy || state.status === "syncing"} onClick={doSync}>同期</button>
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
      <div style={styles.detailHead}><span>取込ルール</span><button style={styles.addBtn} onClick={() => setEdit({ id: uid(), match: "", action: "card", target: "" })}>＋ 追加</button></div>
      {(rules || []).length === 0 ? (
        <div style={styles.detailCard}><div style={{ color: MUTED, fontSize: 13, padding: 6 }}>ルールなし</div></div>
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
            <button style={{ ...styles.saveBtn, opacity: edit.match.trim() && (edit.action === "skip" || edit.target) ? 1 : 0.4 }} disabled={!edit.match.trim() || (edit.action !== "skip" && !edit.target)} onClick={commit}>保存</button>
            <button style={styles.deleteBtn} onClick={remove}>削除</button>
            <button style={styles.cancelBtn} onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings({ config, onSave, onConvertTransfers, onToggleClosedMonth, onClearEntries, entries, cards, debt, memos, subs, plans, closedMonths, theme, onImport, onOpenDesign, onOpenCards, onRemoveItem }) {
  const [c, setC] = useState(config);
  const [flash, setFlash] = useState("");
  const fileRef = useRef(null);
  useEffect(() => setC(config), [config]);
  const groups = [{ key: "accounts", title: "口座" }, { key: "salaryItems", title: "給与項目" }, { key: "memoCategories", title: "メモ分類" },
    { key: "ownTransferKeywords", title: "自分名義キーワード" }];
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
      {/* カード管理への導線 */}
      <button style={styles.navRow} onClick={onOpenCards}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>カード管理</span>
          <span style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{(cards || []).length}枚</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>

      {/* デザイン設定への導線 */}
      <button style={styles.navRow} onClick={onOpenDesign}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>テーマ</span>
        </span>
        <span style={{ color: MUTED, fontSize: 20 }}>›</span>
      </button>

      {/* 月の締め日(サイクル) */}
      <div style={{ marginBottom: 18 }}>
        <div style={styles.detailHead}><span>月の締め日</span></div>
        <div style={styles.detailCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px 8px" }}>
            <span style={{ fontSize: 14 }}>毎月</span>
            <input type="number" inputMode="numeric" min={0} max={28} value={c.cycleCutoffDay ?? 10}
              onChange={(e) => { const v = Math.max(0, Math.min(28, Number(e.target.value) || 0)); const next = { ...c, cycleCutoffDay: v }; setC(next); onSave(next); }}
              style={{ ...styles.textInput, width: 72, textAlign: "center", margin: 0 }} />
            <span style={{ fontSize: 14 }}>日 締め</span>
            {Number(c.cycleCutoffDay) >= 1 && <span style={{ fontSize: 12, color: ACCENT, marginLeft: "auto" }}>{periodRange("2026-06", c.cycleCutoffDay)}</span>}
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div style={styles.detailHead}><span>{g.title}</span><button style={styles.addBtn} onClick={() => addItem(g.key)}>＋ 追加</button></div>
          <div style={styles.detailCard}>{(c[g.key] || []).map((name, i) => <div key={i} style={styles.settingRow}><span>{name}</span><button style={styles.removeBtn} onClick={() => removeItem(g.key, i)}>削除</button></div>)}</div>
        </div>
      ))}
      {/* 口座間の振替を後から探す。振替の判定は取込時にしか走らないので、
          機能を入れる前に取り込んだ記録や手入力の記録は入金/出金のまま残る。 */}
      <CycleVerifier entries={entries} config={c} closedMonths={closedMonths} onClose={onToggleClosedMonth} />

      <TransferFinder entries={entries} ownKeywords={c.ownTransferKeywords} onConvert={onConvertTransfers} />

      <ImportRulesSection rules={c.importRules} cards={cards} accounts={c.accounts} onSave={(rules) => { const next = { ...c, importRules: rules }; setC(next); onSave(next); }} />
      <SyncSection />

      {/* どの版が動いているかを表示する(古いキャッシュのままか、直っていないのかの切り分け用) */}
      <div style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "4px 0 14px" }}>
        版 {typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev"}
      </div>

      {onClearEntries && (
        <div style={{ marginBottom: 18 }}>
          <div style={styles.detailHead}><span>記録の削除</span></div>
          <div style={{ fontSize: 11.5, color: MUTED, margin: "0 2px 6px", lineHeight: 1.6 }}>
            取引の記録だけを消します。設定・カード・取込ルール・計画・定期費は残ります。
            取り込み直したいときに使ってください。<b>消す前に上の「保存」でバックアップを取ってください。</b>
          </div>
          <div style={styles.detailCard}>
            <button style={{ ...styles.backupBtn, color: RED, border: "1px solid #E7C9C0" }}
              onClick={() => {
                if (!window.confirm("取引の記録をすべて削除します。設定やカードは残ります。バックアップは取りましたか？")) return;
                if (!window.confirm("本当に削除します。元に戻せません。よろしいですか？")) return;
                onClearEntries();
              }}>記録をすべて削除</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={styles.detailHead}><span>バックアップ</span></div>
        <div style={styles.detailCard}>
          {flash && <div style={{ ...styles.flash, marginTop: 8 }}>✓ {flash}</div>}
          <button style={styles.backupBtn} onClick={exportCSV}>CSV出力</button>
          <button style={styles.backupBtn} onClick={exportJSON}>保存</button>
          <button style={styles.backupBtn} onClick={() => fileRef.current && fileRef.current.click()}>復元</button>
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
      <button style={styles.backLink} onClick={onBack}>‹ 設定</button>
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


// 既存の記録から自分の口座間の振替を探して「口座振替」に直す。
// 同じ額で逆向き・別の口座・同じ日(指紋があるとき)または同じ月、が条件。
function TransferFinder({ entries, ownKeywords, onConvert }) {
  const [found, setFound] = useState(null);
  const scan = () => setFound(findInternalTransfers(entries || [], ownKeywords));
  if (!onConvert) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={styles.detailHead}><span>口座間の振替を探す</span></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 2px 6px", lineHeight: 1.6 }}>
        同じ額の入金と出金が別の口座に同じ日（日付が無い記録は同じ月）であれば、自分の口座間の移動とみなして「口座振替」に直します。収支から外れます。
      </div>
      <div style={styles.detailCard}>
        <button style={{ ...styles.backupBtn, marginTop: 6 }} onClick={scan}>記録を調べる</button>
        {found && found.length === 0 && <div style={{ color: MUTED, fontSize: 12.5, padding: "8px 2px" }}>振替らしい組は見つかりませんでした</div>}
        {found && found.length > 0 && (
          <>
            {found.map((f) => (
              <div key={f.outId} style={{ ...styles.settingRow, alignItems: "flex-start" }}>
                <span style={{ overflow: "hidden" }}>
                  <span style={{ display: "block", fontSize: 13 }}>{f.date || f.ym}　{yen(f.amount)}</span>
                  <span style={{ display: "block", fontSize: 11, color: MUTED }}>
                    {f.account_out} → {f.account_in}{f.certain ? "" : "（日付か名義が確認できないので要確認）"}
                  </span>
                </span>
              </div>
            ))}
            <button style={{ ...styles.saveBtn, marginTop: 10 }} onClick={() => { onConvert(found); setFound([]); }}>
              {found.length}組を口座振替にする
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// 月度ごとの残高照合。「期首残高 + その月度の増減 = 期末残高」が合っていれば
// 取りこぼしが無いと言えるので、その月度を確定(締め)にできる。
function CycleVerifier({ entries, config, closedMonths, onClose }) {
  const rows = React.useMemo(() => verifyCycles(entries || [], config.cycleCutoffDay), [entries, config.cycleCutoffDay]);
  const closed = new Set(closedMonths || []);
  const fixable = rows.filter((r) => r.ok && !closed.has(r.ym));
  if (!onClose || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={styles.detailHead}><span>月度の残高照合</span></div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 2px 6px", lineHeight: 1.6 }}>
        期首残高（前の月度末）に その月度の増減 を足した額が、期末残高と合っているかを見ます。合っていれば取りこぼしはありません。
      </div>
      <div style={styles.detailCard}>
        {rows.map((r) => (
          <div key={r.ym} style={{ ...styles.settingRow, alignItems: "flex-start" }}>
            <span style={{ overflow: "hidden" }}>
              <span style={{ display: "block", fontSize: 13 }}>
                {periodLabel(r.ym, config.cycleCutoffDay)}
                {closed.has(r.ym) && <span style={{ fontSize: 10.5, color: ACCENT, marginLeft: 6 }}>確定済み</span>}
              </span>
              <span style={{ display: "block", fontSize: 11, color: r.diff === 0 ? MUTED : RED }}>
                {r.closing == null || r.opening == null
                  ? "残高の記録が足りず照合できません"
                  : r.ok
                    ? `✓ ${yen(r.opening)} ＋ 増減${yen(r.net)} ＝ ${yen(r.closing)}`
                    : `⚠ ${yen(Math.abs(r.diff))} 合いません（計算 ${yen(r.expected)} / 実際 ${yen(r.closing)}）`}
              </span>
              <span style={{ display: "block", fontSize: 10.5, color: r.covered ? MUTED : RED, marginTop: 2 }}>
                {r.asOf
                  ? (r.covered ? `残高は ${r.asOf} 時点` : `残高は ${r.asOf} 時点で、締め日 ${r.endDate} まで届いていません（その後の取引が抜けたまま合ってしまいます）`)
                  : "残高がいつ時点か分かりません（取り込み直すと記録されます）"}
              </span>
            </span>
            {r.ok && !closed.has(r.ym) && (
              <button style={styles.addBtn} onClick={() => onClose(r.ym)}>確定</button>
            )}
          </div>
        ))}
        {fixable.length > 0 && (
          <button style={{ ...styles.saveBtn, marginTop: 10 }} onClick={() => fixable.forEach((r) => onClose(r.ym))}>
            一致した{fixable.length}ヶ月をまとめて確定
          </button>
        )}
      </div>
    </div>
  );
}
