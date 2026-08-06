import React, { useMemo, useState } from "react";
import { ACCENT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, periodLabel, acctRole, planVsActualForMonth, annualOutlook, cardBreakdown, cardClaimStates, upcomingDebits, balanceReachesCycleEnd, cycleEndDate, addMonth, computeSummary } from '../utils';
import { styles } from '../styles.js';

export function Summary({ summary, balancesNow, prevBalTotal, plans, subs, config, cards, debt, memos, monthEntries, entries, closedMonths, ym, onOpenPlan, onOpenCards, onOpenClose, onOpenImport }) {
  const [cardOpen, setCardOpen] = useState(false);
  // 残高はその月に記録が無ければ直近の月から引き継ぐ(前月末のまま動いていない、という意味)
  const shown = balancesNow || {};
  const hasBal = Object.keys(shown).length > 0;
  const balTotalNow = Object.values(shown).reduce((a, b) => a + b.amount, 0);
  const balChange = (hasBal && prevBalTotal != null) ? balTotalNow - prevBalTotal : null;
  const partialAccounts = Object.entries(shown)
    .filter(([, b]) => !balanceReachesCycleEnd(b, config.cycleCutoffDay))
    .map(([acc, b]) => [acc, cycleEndDate(b.ym, config.cycleCutoffDay)]);
  const breakdown = useMemo(() => cardBreakdown(cards, debt || {}, memos, monthEntries, ym), [cards, debt, memos, monthEntries, ym]);
  const claimStates = useMemo(() => cardClaimStates(cards, debt || {}, subs, monthEntries, ym, config.cycleCutoffDay), [cards, debt, subs, monthEntries, ym, config.cycleCutoffDay]);
  const upcoming = useMemo(() => upcomingDebits(entries || [], cards, debt || {}, subs, config.cycleCutoffDay, ym), [entries, cards, debt, subs, config.cycleCutoffDay, ym]);
  const hasBreakdown = breakdown.length > 0 || claimStates.length > 0;
  return (
    <div style={{ padding: "4px 2px" }}>
      <div style={styles.heroCard}>
        <div style={styles.heroLabel}>今月の収支</div>
        <div
          style={{ ...styles.heroValue, color: summary.net >= 0 ? "#fff" : "#FFD9CF" }}>{yen(summary.net)}</div>
        <div style={styles.heroSub}>収入 {yen(summary.income)}　−　支出 {yen(summary.expense)}　投資振替 {yen(summary.invest)}</div>
      </div>
      {onOpenImport && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button style={{ ...styles.closeCta, background: "var(--card-bg)", color: ACCENT, border: `1.5px solid ${ACCENT}`, margin: 0 }} onClick={() => onOpenImport("csv")}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>CSV</span>
          </button>
          <button style={{ ...styles.closeCta, background: "var(--card-bg)", color: ACCENT, border: `1.5px solid ${ACCENT}`, margin: 0 }} onClick={() => onOpenImport("screenshot")}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>スクショ</span>
          </button>
        </div>
      )}
      {onOpenClose && (
        <button style={styles.closeCta} onClick={onOpenClose}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>＋ まとめ入力</span>
        </button>
      )}
      <MonthlySummaryTable summary={summary} cardOpen={cardOpen} setCardOpen={setCardOpen} hasBreakdown={hasBreakdown} breakdown={breakdown} claims={claimStates} />
      <SpendingMeter plans={plans} subs={subs} cards={cards} debt={debt} monthEntries={monthEntries} ym={ym} startDay={config.cycleCutoffDay} />
      <UpcomingDebitsCard rows={upcoming} missingCount={claimStates.filter((row) => !row.due).length} onOpenCards={onOpenCards} />
      <AnnualOutlookCard plans={plans} subs={subs} cards={cards} debt={debt} entries={entries} closedMonths={closedMonths} config={config} ym={ym} onOpenPlan={onOpenPlan} />
      <MonthlyNetChart entries={entries || []} ym={ym} />
      <AccountBalances shown={shown} hasBal={hasBal} total={balTotalNow} change={balChange} partialAccounts={partialAccounts} config={config} ym={ym} net={summary.net} />
    </div>
  );
}
const alignedRow = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "11px 14px", borderBottom: `1px solid ${LINE}` };
const alignedAmount = { textAlign: "right", whiteSpace: "nowrap", fontFamily: "var(--num-font)", fontVariantNumeric: "var(--num-variant)", fontSize: "var(--num-size)" };

function MonthlySummaryTable({ summary, cardOpen, setCardOpen, hasBreakdown, breakdown, claims }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.sectionTitle}>今月</div>
      <div style={{ ...styles.detailCard, padding: 0, overflow: "hidden" }}>
        <AlignedSummaryRow label="給与" value={summary.salaryIncome} color={GREEN} />
        <AlignedSummaryRow label="その他" value={summary.otherIncome} color={GREEN} />
        <button style={{ ...alignedRow, background: "transparent", borderTop: "none", borderLeft: "none", borderRight: "none", cursor: hasBreakdown ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }} onClick={() => hasBreakdown && setCardOpen((value) => !value)} aria-expanded={cardOpen}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>
            <span style={{ ...styles.chev, transform: cardOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>カード請求
          </span>
          <span style={{ ...alignedAmount, color: RED, fontWeight: 600 }}>{yen(-summary.cardTotal)}</span>
        </button>
        {cardOpen && hasBreakdown && <CardBreakdownPanel rows={breakdown} claims={claims} embedded />}
        <AlignedSummaryRow label="出金" value={-summary.cashOut} color={RED} />
        <AlignedSummaryRow label="投資振替" value={summary.invest} color={ACCENT} last />
      </div>
    </div>
  );
}

function AlignedSummaryRow({ label, value, color, last = false }) {
  return <div style={{ ...alignedRow, borderBottom: last ? "none" : alignedRow.borderBottom }}><span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span><span style={{ ...alignedAmount, color, fontWeight: 600 }}>{yen(value)}</span></div>;
}

// カード請求額の内訳(残債とそれ以外)。カード請求セルをタップした時に展開表示する。
// 表示のみで収支計算には影響しない。カードに紐づくメモがあれば参考情報として一緒に表示。
function CardBreakdownPanel({ rows, claims, embedded = false }) {
  const [debtOpen, setDebtOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const debtAll = rows.reduce((a, r) => a + r.debtPortion, 0);
  const otherAll = rows.reduce((a, r) => a + r.otherPortion, 0);
  const debtRows = rows.filter((r) => r.debtPortion > 0);
  const otherRows = rows.filter((r) => r.otherPortion > 0 || r.linkedMemos.length > 0);
  return (
    <div style={embedded ? { background: "var(--subtotal-bg)", padding: "0 14px 5px", borderBottom: `1px solid ${LINE}` } : { ...styles.detailCard, marginBottom: 14 }}>
      <BreakdownGroup label="残債分" total={debtAll} rows={debtRows} valueKey="debtPortion" open={debtOpen} onToggle={() => setDebtOpen((o) => !o)} />
      <BreakdownGroup label="残債以外" total={otherAll} rows={otherRows} valueKey="otherPortion" open={otherOpen} onToggle={() => setOtherOpen((o) => !o)} showMemos />
      <CardClaimStatusList rows={claims} />
    </div>
  );
}

const claimStatus = {
  paid: { label: "引落済", color: GREEN, bg: "var(--accent-soft)" },
  confirmed: { label: "確定・未引落", color: RED, bg: "var(--expense-soft)" },
  forecast: { label: "見込み", color: MUTED, bg: "var(--group-bg)" },
};

const shortDate = (date) => date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "";

function CardClaimStatusList({ rows }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const pending = rows.filter((row) => row.status !== "paid").length;
  return (
    <div>
      <button style={{ ...styles.collapseRow, borderBottom: "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: MUTED }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>引落状況</span>
        <span style={{ ...alignedAmount, fontSize: 12, color: MUTED }}>{pending ? `未引落 ${pending}枚` : "引落済"}</span>
      </button>
      {open && <div style={{ padding: "0 0 7px 22px" }}>
        {rows.map((row) => {
          const state = claimStatus[row.status];
          return (
            <div key={row.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{row.due ? `${shortDate(row.due)}引落` : "引落日未設定"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...alignedAmount, fontSize: 13 }}>{yen(row.amount)}</div>
                <span style={{ display: "inline-block", marginTop: 2, padding: "1px 6px", borderRadius: 5, background: state.bg, color: state.color, fontSize: 10, fontWeight: 600 }}>{state.label}</span>
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
function UpcomingDebitsCard({ rows, missingCount = 0, onOpenCards }) {
  const [open, setOpen] = useState(false);
  if (!rows.length && !missingCount) return null;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
      <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>次の引き落とし</span>
        <span style={{ ...alignedAmount, color: rows.length ? RED : MUTED, fontWeight: 600 }}>{rows.length ? yen(-total) : `未設定 ${missingCount}枚`}</span>
      </button>
      {open && <div style={{ paddingBottom: 4 }}>
        {rows.map((row) => {
          const state = claimStatus[row.status];
          return (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ color: ACCENT, fontSize: 12.5, fontWeight: 600 }}>{shortDate(row.date)}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5 }}>{row.label}</span>
              <span style={{ textAlign: "right" }}>
                <span style={{ display: "block", fontFamily: "var(--num-font)", fontVariantNumeric: "var(--num-variant)", fontSize: 13.5 }}>{yen(row.amount)}</span>
                <span style={{ color: state.color, fontSize: 10.5 }}>{state.label}</span>
              </span>
            </div>
          );
        })}
        {missingCount > 0 && (
          <button style={{ ...styles.collapseRow, borderBottom: "none", color: MUTED, padding: "10px 0 6px" }} onClick={onOpenCards}>
            <span style={{ fontSize: 12.5 }}>引落日未設定 {missingCount}枚</span><span style={styles.chev}>›</span>
          </button>
        )}
      </div>}
    </div>
  );
}

function BreakdownGroup({ label, total, rows, valueKey, open, onToggle, showMemos = false }) {
  return (
    <div>
      <button style={styles.collapseRow} onClick={onToggle} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>{label}
        </span>
        <span style={styles.detailTotal}>{yen(total)}</span>
      </button>
      {open && (
        <div style={{ padding: "3px 2px 8px 22px" }}>
          {rows.length === 0 && <div style={{ color: MUTED, fontSize: 12.5, padding: "5px 0" }}>なし</div>}
          {rows.map((r) => (
            <div key={r.name}>
              {r[valueKey] > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", gap: 8, padding: "5px 0", fontSize: 13 }}>
                  <span>{r.name}</span><span style={{ ...alignedAmount, fontSize: 13 }}>{yen(r[valueKey])}</span>
                </div>
              )}
              {showMemos && r.linkedMemos.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0 2px 10px", fontSize: 12, color: MUTED }}>
                  <span>{m.title}</span>{Number(m.amount) > 0 && <span>{yen(m.amount)}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthlyNetChart({ entries, ym }) {
  const [open, setOpen] = useState(false);
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonth(ym, i - 5)), [ym]);
  const points = useMemo(() => months.map((mo) => ({
    mo,
    hasData: entries.some((e) => e.ym === mo && e.cat !== "memo"),
    net: computeSummary(entries.filter((e) => e.ym === mo)).net,
  })), [entries, months]);
  if (points.filter((p) => p.hasData).length < 2) return null;

  const W = 360, H = 126, top = 8, bottom = 24;
  const values = points.filter((p) => p.hasData).map((p) => p.net);
  const max = Math.max(0, ...values), min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const y = (v) => top + ((max - v) / range) * (H - top - bottom);
  const zeroY = y(0), colW = W / points.length, barW = colW * 0.5;
  return (
    <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
      <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>収支推移</span>
        <span style={{ ...alignedAmount, color: points[points.length - 1].net >= 0 ? GREEN : RED, fontWeight: 600 }}>{yen(points[points.length - 1].net)}</span>
      </button>
      {open && <div style={{ padding: "8px 0 4px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="直近6か月の収支推移">
          <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke={LINE} strokeWidth="1" />
          {points.map((p, i) => {
            const x = i * colW + (colW - barW) / 2;
            const valueY = y(p.net);
            const height = p.hasData ? Math.max(2, Math.abs(valueY - zeroY)) : 0;
            return (
              <g key={p.mo}>
                {p.hasData && <rect x={x} y={p.net >= 0 ? valueY : zeroY} width={barW} height={height} rx="2" fill={p.net >= 0 ? GREEN : RED} opacity={p.mo === ym ? 1 : 0.58} />}
                <text x={i * colW + colW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={p.mo === ym ? ACCENT : MUTED} fontWeight={p.mo === ym ? 700 : 400}>{parseInt(p.mo.slice(5), 10)}月</text>
              </g>
            );
          })}
        </svg>
      </div>}
    </div>
  );
}

// 使いすぎメーター。今月の支出(実績)を計画支出(固定費+変動費)と並べ、
// バーと一言で「使いすぎ/計画内」を判定できるようにする。副次的に収支の実績/計画も添える。
// 「内訳」を開くと、その月の支出をカード別＋現金(出金)で確認できる(既存の記録から表示。入力は不要)。
function SpendingMeter({ plans, subs, cards, debt, monthEntries, ym, startDay }) {
  const [open, setOpen] = useState(false);
  const r = useMemo(() => planVsActualForMonth(plans, subs, monthEntries, ym, debt, cards, startDay), [plans, subs, cards, debt, monthEntries, ym, startDay]);
  const bd = useMemo(() => {
    const cardMap = {}; let cashOut = 0;
    for (const e of monthEntries) {
      if (e.cat === "card") cardMap[e.item] = (cardMap[e.item] || 0) + Math.abs(e.amount);
      else if (e.cat === "account" && acctRole(e.item) === "out") cashOut += Math.abs(e.amount);
    }
    return { cards: Object.entries(cardMap).sort((a, b) => b[1] - a[1]), cashOut };
  }, [monthEntries]);
  const hasBd = bd.cards.length > 0 || bd.cashOut > 0;
  const over = r.actualSpending - r.planSpending;   // +なら使いすぎ
  const pct = r.planSpending > 0 ? Math.min(1, r.actualSpending / r.planSpending) : (r.actualSpending > 0 ? 1 : 0);
  const barColor = over > 0 ? RED : ACCENT;
  return (
    <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
      <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>支出状況</span>
        <span style={{ ...alignedAmount, color: over > 0 ? RED : GREEN, fontWeight: 600 }}>{yen(r.actualSpending)}</span>
      </button>
      {open && <div style={{ padding: "10px 0 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, color: MUTED }}>{periodLabel(ym, startDay)}</span>
          <span style={{ fontSize: 12.5, color: MUTED }}>計画 {yen(r.planSpending)}</span>
        </div>
        <div style={{ height: 10, borderRadius: 6, background: "var(--group-bg)", overflow: "hidden" }}>
          <div style={{ width: `${pct * 100}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width .3s" }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: over > 0 ? RED : GREEN }}>
          {over > 0 ? `${yen(over)} 使いすぎ` : over < 0 ? `計画まで あと ${yen(-over)}` : "計画どおり"}
        </div>
        {hasBd && <div style={{ marginTop: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                {bd.cards.map(([name, v]) => (
                  <div key={name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", gap: 8, padding: "4px 2px", fontSize: 13 }}>
                    <span style={{ color: MUTED }}>{name}</span><span style={{ ...alignedAmount, fontSize: 13 }}>{yen(v)}</span>
                  </div>
                ))}
                {bd.cashOut > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", gap: 8, padding: "4px 2px", fontSize: 13 }}>
                    <span style={{ color: MUTED }}>現金（出金）</span><span style={{ ...alignedAmount, fontSize: 13 }}>{yen(bd.cashOut)}</span>
                  </div>
                )}
              </div>}
      </div>}
    </div>
  );
}

// 今年の着地見込み。年度末の収支(累計)と残高の見込みを一目で。タップで計画タブへ。
function AnnualOutlookCard({ plans, subs, cards, debt, entries, closedMonths, config, ym, onOpenPlan }) {
  const o = useMemo(() => annualOutlook(plans, subs, entries || [], closedMonths, ym, debt, cards, config?.cycleCutoffDay || 0), [plans, subs, cards, debt, entries, closedMonths, config?.cycleCutoffDay, ym]);
  return (
    <button style={{ ...styles.detailCard, ...alignedRow, border: `1px solid ${LINE}`, borderRadius: "var(--radius)", background: "var(--card-bg)", marginBottom: 10, fontFamily: "inherit", cursor: onOpenPlan ? "pointer" : "default", textAlign: "left" }} onClick={() => onOpenPlan && onOpenPlan()}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={styles.chev}>›</span>年度末見込み</span>
      <span style={{ ...alignedAmount, fontWeight: 600 }}>{yen(o.balEnd)}</span>
    </button>
  );
}

function AccountBalances({ shown, hasBal, total, change, partialAccounts, config, ym, net }) {
  const [open, setOpen] = useState(false);
  if (!hasBal) return null;
  const diff = change == null ? null : change - net;
  return (
    <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
      <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>口座残高</span>
        <span style={{ ...alignedAmount, fontWeight: 600 }}>{yen(total)}</span>
      </button>
      {open && <div style={{ paddingBottom: 7 }}>
        {Object.entries(shown).map(([acc, b]) => {
          const partial = !balanceReachesCycleEnd(b, config.cycleCutoffDay);
          return <div key={acc} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", gap: 8, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
            <span style={{ minWidth: 0, fontSize: 13 }}>{acc}{b.ym !== ym && <small style={{ color: MUTED, marginLeft: 5 }}>{ymLabel(b.ym)}から</small>}{partial && <small style={{ color: RED, marginLeft: 5 }}>{b.asOf}時点</small>}</span>
            <span style={{ ...alignedAmount, fontSize: 13 }}>{yen(b.amount)}</span>
          </div>;
        })}
        {change != null && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 132px", gap: 8, padding: "8px 0", fontSize: 12.5 }}><span style={{ color: MUTED }}>前月比</span><span style={{ ...alignedAmount, fontSize: 12.5, color: change >= 0 ? GREEN : RED }}>{yen(change)}</span></div>}
        {diff != null && Math.abs(diff) >= 1 && <div style={{ color: RED, fontSize: 11.5, padding: "3px 0" }}>⚠ 収支との差 {yen(Math.abs(diff))}</div>}
        {partialAccounts.length > 0 && <div style={{ color: MUTED, fontSize: 10.5, padding: "3px 0", lineHeight: 1.5 }}>{partialAccounts.map(([acc, end]) => `${acc} ${end}`).join("・")}まで未確定</div>}
      </div>}
    </div>
  );
}

