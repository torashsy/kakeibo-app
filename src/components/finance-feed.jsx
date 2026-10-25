import React from "react";
import { MUTED, ACCENT } from "../theme.js";
import { styles } from "../styles.js";
import { yen } from "../utils";

const dateText = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "未確認";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const safeSource = (value) => {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "mail.google.com" ? url.href : null; } catch { return null; }
};
const resultLabel = { applied: "反映済み", matched: "照合済み", conflict: "要確認", pending: "未反映", superseded: "新しい通知あり" };

export function FinanceFeedPanel({ feed, results = [], state, expanded = false, onOpen, onRefresh }) {
  const visible = results.filter((r) => r.status !== "superseded");
  const conflicts = visible.filter((r) => r.status === "conflict").length;
  const pending = visible.filter((r) => r.status === "pending").length;
  const sources = Array.isArray(feed?.sources) ? feed.sources : [];
  const rows = [...visible].sort((a, b) => String(b.observation?.receivedAt || "").localeCompare(String(a.observation?.receivedAt || "")));
  return (
    <section style={{ ...styles.detailCard, marginBottom: 14, padding: 14 }} aria-label="金融情報の自動更新">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <strong style={{ fontSize: 14 }}>金融情報の自動更新</strong>
        {onOpen && <button onClick={onOpen} style={{ ...styles.backLink, margin: 0 }}>詳細 ›</button>}
      </div>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.7, margin: "8px 0" }}>
        メール確認：{dateText(feed?.checkedAt)}
        {conflicts > 0 && <span style={{ color: "var(--expense)" }}> · 要確認 {conflicts}件</span>}
        {pending > 0 && <span> · 未反映 {pending}件</span>}
      </p>
      {state?.error && <p role="status" style={{ fontSize: 12, color: "var(--expense)" }}>更新を確認できません。最後に受信した情報があれば表示しています。</p>}
      {feed?.ingestion?.status === "blocked" && <p role="status" style={{ fontSize: 12, color: "var(--expense)", lineHeight: 1.7 }}>{feed.ingestion.detail || "メール到着時の自動取り込みは設定未完了です。"}</p>}
      {state?.needsSync && !state?.error && <p role="status" style={{ fontSize: 12, color: MUTED }}>クラウド同期を完了してから再読み込みすると、この端末の記録と照合できます。</p>}
      {state?.mode === "signedOut" || state?.mode === "off" ? (
        <p style={{ color: MUTED, fontSize: 12 }}>設定の「クラウド同期」にログインすると、確認できた請求額と残高を受け取れます。</p>
      ) : !feed && <p style={{ color: MUTED, fontSize: 12 }}>取得できた金融情報はまだありません。</p>}
      {expanded && <>
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.7 }}>金額・対象・日付が確認できた請求と残高を反映します。買い物速報は請求額に加算しません。既存記録と異なる金額は、記録を残して「要確認」にします。</p>
        {sources.length > 0 && <div style={{ borderTop: "1px solid var(--border)", paddingTop: 9 }}>
          {sources.map((s, i) => <div key={s.id || i} style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 9 }}>
            <strong>{s.name || s.id}</strong><div style={{ color: MUTED }}>{s.detail || s.status || "取得状況を確認中"}</div>
          </div>)}
        </div>}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {rows.map((r, i) => {
            const o = r.observation || {};
            const link = safeSource(o.sourceUrl);
            return <article key={o.id || i} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                <strong>{o.cardName || o.account || o.subject || "通知"}</strong>
                <span style={{ color: r.status === "conflict" ? "var(--expense)" : ACCENT, flexShrink: 0 }}>{resultLabel[r.status] || "未反映"}</span>
              </div>
              {typeof o.amount === "number" && Number.isFinite(o.amount) && <div style={{ fontSize: 19, fontWeight: 700, marginTop: 5 }}>{yen(o.amount)}</div>}
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
                {o.kind === "card_bill" && o.dueDate && <div>支払予定日：{o.dueDate} · 引落完了は未確認</div>}
                {o.kind === "balance" && o.asOf && <div>{o.asOf} 時点の残高</div>}
                <div>{r.message}</div>
                {o.note && <div>{o.note}</div>}
                {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>元のメールを開く ↗</a>}
              </div>
            </article>;
          })}
        </div>
        {onRefresh && <button type="button" onClick={onRefresh} style={{ ...styles.backupBtn, marginTop: 12 }}>受信済みデータを再読込</button>}
      </>}
    </section>
  );
}
