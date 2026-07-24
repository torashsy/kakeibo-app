import React, { useMemo, useState } from "react";
import { ACCENT, ACCENT_SOFT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, planVsActualForMonth, cardBreakdown } from '../utils';
import { styles } from '../styles.js';

export function Summary({ summary, prevBalTotal, plans, subs, config, cards, debt, memos, monthEntries, ym }) {
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
      <PlanCompareCard plans={plans} subs={subs} monthEntries={monthEntries} ym={ym} />
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

// 今月の実績と計画を比較する小カード。計画レイヤー(計画/実績/見通し)とは別に、
// サマリから一目で「計画どおり進んでいるか」を確認できるようにする。
function PlanCompareCard({ plans, subs, monthEntries, ym }) {
  const r = useMemo(() => planVsActualForMonth(plans, subs, monthEntries, ym), [plans, subs, monthEntries, ym]);
  const diffColor = r.diff === 0 ? MUTED : r.diff > 0 ? GREEN : RED;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={styles.sectionTitle}>計画との比較（{ymLabel(ym)}）</div>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>計画ベースの収支です（交際費などのメモは含みません）。</div>
      <div style={styles.balCard}>
        <div style={styles.balRow}><span style={styles.balAcc}>実績</span><span style={styles.balVal}>{yen(r.actualNet)}</span></div>
        <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED }}>計画</span><span style={{ ...styles.balVal, color: MUTED }}>{yen(r.planNet)}</span></div>
        <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}>
          <span style={{ ...styles.balAcc, fontWeight: 600 }}>差（実績−計画）</span>
          <span style={{ ...styles.balVal, fontWeight: 600, color: diffColor }}>{r.diff > 0 ? "+" : ""}{yen(r.diff)}</span>
        </div>
      </div>
    </div>
  );
}

export function SumCell({ label, value, color }) {
  return <div style={styles.sumCell}><div style={styles.sumCellLabel}>{label}</div><div style={{ ...styles.sumCellValue, color }}>{yen(value)}</div></div>;
}
