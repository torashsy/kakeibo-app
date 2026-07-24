import React, { useMemo, useState } from "react";
import { ACCENT, ACCENT_SOFT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, periodLabel, acctRole, planVsActualForMonth, annualOutlook, cardBreakdown } from '../utils';
import { styles } from '../styles.js';

export function Summary({ summary, prevBalTotal, plans, subs, config, cards, debt, memos, monthEntries, entries, closedMonths, ym, onOpenPlan, onOpenClose }) {
  const [cardOpen, setCardOpen] = useState(false);
  const hasBal = Object.keys(summary.balances).length > 0;
  const balChange = (hasBal && prevBalTotal != null) ? summary.balTotal - prevBalTotal : null;
  const breakdown = useMemo(() => cardBreakdown(cards, debt || {}, memos, monthEntries, ym), [cards, debt, memos, monthEntries, ym]);
  const hasBreakdown = breakdown.length > 0;
  return (
    <div style={{ padding: "4px 2px" }}>
      <div style={styles.heroCard}>
        <div style={styles.heroLabel}>今月の収支</div>
        <div
          style={{ ...styles.heroValue, color: summary.net >= 0 ? "#fff" : "#FFD9CF" }}>{yen(summary.net)}</div>
        <div style={styles.heroSub}>収入 {yen(summary.income)}　−　支出 {yen(summary.expense)}</div>
      </div>
      {onOpenClose && (
        <button style={styles.closeCta} onClick={onOpenClose}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>＋ 今月をまとめて入力</span>
          <span style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>給与・カード・残高を1画面で。前月を仮置き済み</span>
        </button>
      )}
      <SpendingMeter plans={plans} subs={subs} monthEntries={monthEntries} ym={ym} startDay={config.cycleCutoffDay} />
      <AnnualOutlookCard plans={plans} subs={subs} entries={entries} closedMonths={closedMonths} ym={ym} onOpenPlan={onOpenPlan} />
      <div style={styles.sumGrid}>
        <SumCell label="給与(手取り)" value={summary.gross + summary.deduction} color={GREEN} />
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
        <SumCell label="入金(預入・入金)" value={summary.cashIn} color={GREEN} />
        <SumCell label="出金(引出・出金)" value={-summary.cashOut} color={RED} />
      </div>
      {cardOpen && hasBreakdown && <CardBreakdownPanel rows={breakdown} />}
      <div style={styles.sectionTitle}>口座残高</div>
      <div style={styles.balCard}>
        {!hasBal && <div style={{ color: MUTED, fontSize: 13, padding: "6px 2px" }}>この月の残高記録はまだありません</div>}
        {Object.entries(summary.balances).map(([acc, v]) => <div style={styles.balRow} key={acc}><span style={styles.balAcc}>{acc}</span><span style={styles.balVal}>{yen(v)}</span></div>)}
        {hasBal && <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}><span style={{ ...styles.balAcc, fontWeight: 600 }}>合計</span><span style={{ ...styles.balVal, fontWeight: 600 }}>{yen(summary.balTotal)}</span></div>}
        {balChange != null && <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>前月からの増減</span><span style={{ ...styles.balVal, color: balChange >= 0 ? GREEN : RED }}>{yen(balChange)}</span></div>}
      </div>
      {balChange != null && (() => {
        const diff = balChange - summary.net;
        const ok = Math.abs(diff) < 1;
        return (
          <div style={{ ...styles.checkCard, background: ok ? ACCENT_SOFT : "var(--expense-soft)" }}>
            {ok ? <span style={{ color: ACCENT, fontSize: 12.5 }}>✓ 残高の増減と収支が一致しています</span>
              : <span style={{ color: RED, fontSize: 12.5 }}>⚠ 残高増減と収支に {yen(Math.abs(diff))} のズレがあります（入力もれの可能性）</span>}
          </div>
        );
      })()}
    </div>
  );
}

// カード請求額の内訳(残債とそれ以外)。カード請求セルをタップした時に展開表示する。
// 表示のみで収支計算には影響しない。カードに紐づくメモがあれば参考情報として一緒に表示。
function CardBreakdownPanel({ rows }) {
  const totalAll = rows.reduce((a, r) => a + r.total, 0);
  const debtAll = rows.reduce((a, r) => a + r.debtPortion, 0);
  const otherAll = rows.reduce((a, r) => a + r.otherPortion, 0);
  return (
    <div style={{ ...styles.detailCard, marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, color: MUTED, padding: "8px 2px 2px" }}>残債（分割払い）とそれ以外の内訳です。</div>
      {rows.map((r) => (
        <div key={r.name} style={{ padding: "8px 2px" }}>
          <div style={styles.subGroupHead}><span>{r.name}</span><span style={styles.subGroupTotal}>{yen(r.total)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 2px 2px", fontSize: 13, color: MUTED }}>
            <span>残債</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{yen(r.debtPortion)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 2px", fontSize: 13, color: MUTED }}>
            <span>残債以外</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{yen(r.otherPortion)}</span>
          </div>
          {r.linkedMemos.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {r.linkedMemos.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: MUTED, padding: "3px 0" }}>
                  <span>・{m.title}</span>
                  {Number(m.amount) > 0 && <span style={{ fontVariantNumeric: "tabular-nums" }}>{yen(m.amount)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={styles.subtotalRow}><span>合計</span><span style={styles.subtotalNum}>{yen(totalAll)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 2px", fontSize: 12.5, color: MUTED }}><span>残債計</span><span>{yen(debtAll)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 2px", fontSize: 12.5, color: MUTED }}><span>残債以外計</span><span>{yen(otherAll)}</span></div>
    </div>
  );
}

// 使いすぎメーター。今月の支出(実績)を計画支出(固定費+変動費)と並べ、
// バーと一言で「使いすぎ/計画内」を判定できるようにする。副次的に収支の実績/計画も添える。
// 「内訳」を開くと、その月の支出をカード別＋現金(出金)で確認できる(既存の記録から表示。入力は不要)。
function SpendingMeter({ plans, subs, monthEntries, ym, startDay }) {
  const [open, setOpen] = useState(false);
  const r = useMemo(() => planVsActualForMonth(plans, subs, monthEntries, ym), [plans, subs, monthEntries, ym]);
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
        <div style={{ marginTop: 4, fontSize: 11.5, color: MUTED }}>収支の実績 {yen(r.actualNet)}（計画 {yen(r.planNet)}）。計画支出＝固定費（定期費）＋変動費。</div>
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
function AnnualOutlookCard({ plans, subs, entries, closedMonths, ym, onOpenPlan }) {
  const o = useMemo(() => annualOutlook(plans, subs, entries || [], closedMonths, ym), [plans, subs, entries, closedMonths, ym]);
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

export function SumCell({ label, value, color }) {
  return <div style={styles.sumCell}><div style={styles.sumCellLabel}>{label}</div><div style={{ ...styles.sumCellValue, color }}>{yen(value)}</div></div>;
}
