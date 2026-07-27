import React, { useMemo, useState } from "react";
import { ACCENT, ACCENT_SOFT, LINE, MUTED, RED, GREEN } from '../theme.js';
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
  const upcoming = useMemo(() => upcomingDebits(entries || [], cards, debt || {}, subs, config.cycleCutoffDay), [entries, cards, debt, subs, config.cycleCutoffDay]);
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
      <UpcomingDebitsCard rows={upcoming} missingCount={claimStates.filter((row) => !row.due).length} onOpenCards={onOpenCards} />
      <SpendingMeter plans={plans} subs={subs} cards={cards} debt={debt} monthEntries={monthEntries} ym={ym} startDay={config.cycleCutoffDay} />
      <AnnualOutlookCard plans={plans} subs={subs} cards={cards} debt={debt} entries={entries} closedMonths={closedMonths} config={config} ym={ym} onOpenPlan={onOpenPlan} />
      <div style={styles.sumGrid}>
        <SumCell label="給与" value={summary.salaryIncome} color={GREEN} />
        <SumCell label="その他" value={summary.otherIncome} color={GREEN} />
        <button
          style={{ ...styles.sumCell, width: "100%", textAlign: "left", fontFamily: "inherit", cursor: hasBreakdown ? "pointer" : "default" }}
          onClick={() => hasBreakdown && setCardOpen((o) => !o)}
        >
          <div style={styles.sumCellLabel}>
            カード請求
            {hasBreakdown && <span style={{ ...styles.chev, transform: cardOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s", verticalAlign: -2 }}>›</span>}
          </div>
          <div style={{ ...styles.sumCellValue, color: RED }}>{yen(-summary.cardTotal)}</div>
        </button>
        <SumCell label="出金(引出・出金)" value={-summary.cashOut} color={RED} />
        <SumCell label="投資振替" value={summary.invest} color={ACCENT} style={{ gridColumn: "1 / -1" }} />
      </div>
      {cardOpen && hasBreakdown && <CardBreakdownPanel rows={breakdown} claims={claimStates} />}
      <MonthlyNetChart entries={entries || []} ym={ym} />
      <div style={styles.sectionTitle}>口座残高</div>
      <div style={styles.balCard}>
        {!hasBal && <div style={{ color: MUTED, fontSize: 13, padding: "6px 2px" }}>この月の残高記録はまだありません</div>}
        {Object.entries(shown).map(([acc, b]) => {
          // 締め日まで届いていない残高は「月末残高」ではない。そのあとの取引が
          // 抜けたまま合っているように見えるので、いつ時点かを添える。
          const partial = !balanceReachesCycleEnd(b, config.cycleCutoffDay);
          return (
            <div style={styles.balRow} key={acc}>
              <span style={styles.balAcc}>
                {acc}
                {b.ym !== ym && <span style={{ fontSize: 10.5, color: MUTED, marginLeft: 6 }}>{ymLabel(b.ym)}から</span>}
                {partial && <span style={{ fontSize: 10.5, color: RED, marginLeft: 6 }}>{b.asOf}時点</span>}
              </span>
              <span style={styles.balVal}>{yen(b.amount)}</span>
            </div>
          );
        })}
        {partialAccounts.length > 0 && (
          <div style={{ fontSize: 11, color: RED, padding: "6px 2px 0", lineHeight: 1.5 }}>
            {/* 締め日は残高が属する月度のもの。繰り越された残高だと表示中の月とは別になる */}
            {partialAccounts.map(([acc, end]) => `${acc}（締め日 ${end}）`).join("・")}
            の残高は締め日まで届いていません。翌月の明細も取り込むと、締め日時点の残高になります。
          </div>
        )}
        {hasBal && <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}><span style={{ ...styles.balAcc, fontWeight: 600 }}>合計</span><span style={{ ...styles.balVal, fontWeight: 600 }}>{yen(balTotalNow)}</span></div>}
        {balChange != null && <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>前月からの増減</span><span style={{ ...styles.balVal, color: balChange >= 0 ? GREEN : RED }}>{yen(balChange)}</span></div>}
      </div>
      {balChange != null && (() => {
        const diff = balChange - summary.net;
        const ok = Math.abs(diff) < 1;
        return (
          <div style={{ ...styles.checkCard, background: ok ? ACCENT_SOFT : "var(--expense-soft)" }}>
          {ok ? <span style={{ color: ACCENT, fontSize: 12.5 }}>✓ 一致</span>
            : <span style={{ color: RED, fontSize: 12.5 }}>⚠ 差 {yen(Math.abs(diff))}</span>}
          </div>
        );
      })()}
    </div>
  );
}

// カード請求額の内訳(残債とそれ以外)。カード請求セルをタップした時に展開表示する。
// 表示のみで収支計算には影響しない。カードに紐づくメモがあれば参考情報として一緒に表示。
function CardBreakdownPanel({ rows, claims }) {
  const [debtOpen, setDebtOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const totalAll = rows.reduce((a, r) => a + r.total, 0);
  const debtAll = rows.reduce((a, r) => a + r.debtPortion, 0);
  const otherAll = rows.reduce((a, r) => a + r.otherPortion, 0);
  const debtRows = rows.filter((r) => r.debtPortion > 0);
  const otherRows = rows.filter((r) => r.otherPortion > 0 || r.linkedMemos.length > 0);
  return (
    <div style={{ ...styles.detailCard, marginBottom: 14 }}>
      <CardClaimStatusList rows={claims} />
      <BreakdownGroup label="残債分" total={debtAll} rows={debtRows} valueKey="debtPortion" open={debtOpen} onToggle={() => setDebtOpen((o) => !o)} />
      <BreakdownGroup label="残債以外" total={otherAll} rows={otherRows} valueKey="otherPortion" open={otherOpen} onToggle={() => setOtherOpen((o) => !o)} showMemos />
      <div style={styles.subtotalRow}><span>カード請求計</span><span style={styles.subtotalNum}>{yen(totalAll)}</span></div>
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
  if (!rows.length) return null;
  return (
    <div style={{ padding: "5px 2px 9px", borderBottom: `1px solid ${LINE}` }}>
      {rows.map((row) => {
        const state = claimStatus[row.status];
        return (
          <div key={row.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: "6px 0" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{row.due ? `${shortDate(row.due)}引落` : "引落日未設定"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--num-font)", fontVariantNumeric: "var(--num-variant)", fontSize: 13.5, fontWeight: 600 }}>{yen(row.amount)}</div>
              <span style={{ display: "inline-block", marginTop: 3, padding: "1px 6px", borderRadius: 5, background: state.bg, color: state.color, fontSize: 10.5, fontWeight: 600 }}>{state.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UpcomingDebitsCard({ rows, missingCount = 0, onOpenCards }) {
  const [open, setOpen] = useState(false);
  if (!rows.length && !missingCount) return null;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const visible = open ? rows : rows.slice(0, 3);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={styles.sectionTitle}>次の引き落とし</div>
      <div style={styles.balCard}>
        {rows.length > 0 && <div style={{ ...styles.balRow, borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 12.5, color: MUTED }}>30日以内</span>
          <span style={{ ...styles.balVal, color: RED }}>{yen(-total)}</span>
        </div>}
        {visible.map((row) => {
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
        {rows.length > 3 && (
          <button style={{ ...styles.chipGhost, width: "100%", padding: "8px 0 3px" }} onClick={() => setOpen((value) => !value)}>{open ? "閉じる" : `ほか${rows.length - 3}件`}</button>
        )}
        {missingCount > 0 && (
          <button style={{ ...styles.collapseRow, borderBottom: "none", color: MUTED, padding: "10px 0 6px" }} onClick={onOpenCards}>
            <span style={{ fontSize: 12.5 }}>引落日未設定 {missingCount}枚</span><span style={styles.chev}>›</span>
          </button>
        )}
      </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 13 }}>
                  <span>{r.name}</span><span style={{ fontFamily: "var(--num-font)", fontVariantNumeric: "var(--num-variant)" }}>{yen(r[valueKey])}</span>
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
    <div style={{ marginBottom: 14 }}>
      <div style={styles.sectionTitle}>収支推移</div>
      <div style={{ ...styles.balCard, padding: "8px 8px 4px" }}>
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
      </div>
    </div>
  );
}

// 使いすぎメーター。今月の支出(実績)を計画支出(固定費+変動費)と並べ、
// バーと一言で「使いすぎ/計画内」を判定できるようにする。副次的に収支の実績/計画も添える。
// 「内訳」を開くと、その月の支出をカード別＋現金(出金)で確認できる(既存の記録から表示。入力は不要)。
function SpendingMeter({ plans, subs, cards, debt, monthEntries, ym, startDay }) {
  const [open, setOpen] = useState(false);
  const r = useMemo(() => planVsActualForMonth(plans, subs, monthEntries, ym, debt, cards), [plans, subs, cards, debt, monthEntries, ym]);
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
    <div style={{ marginBottom: 14 }}>
      <div style={styles.sectionTitle}>使いすぎ？（{periodLabel(ym, startDay)}の支出）</div>
      <div style={styles.balCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: 21, fontWeight: 700, color: over > 0 ? RED : "inherit" }}>{yen(r.actualSpending)}</span>
          <span style={{ fontSize: 12.5, color: MUTED }}>計画 {yen(r.planSpending)}</span>
        </div>
        <div style={{ height: 10, borderRadius: 6, background: "var(--group-bg)", overflow: "hidden" }}>
          <div style={{ width: `${pct * 100}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width .3s" }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: over > 0 ? RED : GREEN }}>
          {over > 0 ? `${yen(over)} 使いすぎ` : over < 0 ? `計画まで あと ${yen(-over)}` : "計画どおり"}
        </div>
        {hasBd && (
          <>
            <button style={{ ...styles.chipGhost, marginTop: 10 }} onClick={() => setOpen((o) => !o)}>
              内訳を{open ? "閉じる" : "見る"}<span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s", verticalAlign: -2, marginLeft: 4 }}>›</span>
            </button>
            {open && (
              <div style={{ marginTop: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                {bd.cards.map(([name, v]) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 2px", fontSize: 13 }}>
                    <span style={{ color: MUTED }}>{name}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{yen(v)}</span>
                  </div>
                ))}
                {bd.cashOut > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 2px", fontSize: 13 }}>
                    <span style={{ color: MUTED }}>現金（出金）</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{yen(bd.cashOut)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 今年の着地見込み。年度末の収支(累計)と残高の見込みを一目で。タップで計画タブへ。
function AnnualOutlookCard({ plans, subs, cards, debt, entries, closedMonths, config, ym, onOpenPlan }) {
  const o = useMemo(() => annualOutlook(plans, subs, entries || [], closedMonths, ym, debt, cards, config?.cycleCutoffDay || 0), [plans, subs, cards, debt, entries, closedMonths, config?.cycleCutoffDay, ym]);
  return (
    <button style={{ ...styles.balCard, width: "100%", textAlign: "left", fontFamily: "inherit", cursor: onOpenPlan ? "pointer" : "default", display: "block", marginBottom: 14 }} onClick={() => onOpenPlan && onOpenPlan()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{o.fyStart}年度の見込み</span>
        {onOpenPlan && <span style={{ color: MUTED, fontSize: 16 }}>›</span>}
      </div>
      <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>年間の収支</span><span style={{ ...styles.balVal, color: o.netForecast >= 0 ? GREEN : RED }}>{yen(o.netForecast)}</span></div>
      <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>年度末の残高</span><span style={styles.balVal}>{yen(o.balEnd)}</span></div>
    </button>
  );
}

export function SumCell({ label, value, color, style }) {
  return <div style={{ ...styles.sumCell, ...style }}><div style={styles.sumCellLabel}>{label}</div><div style={{ ...styles.sumCellValue, color }}>{yen(value)}</div></div>;
}
