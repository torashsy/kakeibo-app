import React, { useMemo } from "react";
import { ACCENT, ACCENT_SOFT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, planVsActualForMonth } from '../utils.js';
import { styles } from '../styles.js';
import { Editable } from '../edit.jsx';

export function Summary({ summary, prevBalTotal, plans, config, cards, memos, monthEntries, ym }) {
  const hasBal = Object.keys(summary.balances).length > 0;
  const balChange = (hasBal && prevBalTotal != null) ? summary.balTotal - prevBalTotal : null;
  return (
    <div style={{ padding: "4px 2px" }}>
      <Editable id="hero.bg" base={styles.heroCard}>
        <Editable id="hero.label" base={styles.heroLabel}>今月の収支</Editable>
        <Editable id="hero.value" base={{ ...styles.heroValue, color: summary.net >= 0 ? "#fff" : "#FFD9CF" }}>{yen(summary.net)}</Editable>
        <Editable id="hero.sub" base={styles.heroSub}>収入 {yen(summary.income)}　−　支出 {yen(summary.expense)}</Editable>
      </Editable>
      <div style={styles.sumGrid}>
        <SumCell label="給与(手取り)" value={summary.gross + summary.deduction} color={GREEN} />
        <SumCell label="カード請求" value={-summary.cardTotal} color={RED} />
        <SumCell label="入金(現金・送金)" value={summary.cashIn} color={GREEN} />
        <SumCell label="出金(現金・送金)" value={-summary.cashOut} color={RED} />
      </div>
      <PlanCompareCard plans={plans} config={config} cards={cards} memos={memos} monthEntries={monthEntries} ym={ym} />
      <Editable id="sec.title" base={styles.sectionTitle}>口座残高</Editable>
      <Editable id="card.bg" base={styles.balCard}>
        {!hasBal && <div style={{ color: MUTED, fontSize: 13, padding: "6px 2px" }}>この月の残高記録はまだありません</div>}
        {Object.entries(summary.balances).map(([acc, v]) => <Editable key={acc} id="bal.row" base={styles.balRow}><span style={styles.balAcc}>{acc}</span><span style={styles.balVal}>{yen(v)}</span></Editable>)}
        {hasBal && <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}><span style={{ ...styles.balAcc, fontWeight: 600 }}>合計</span><span style={{ ...styles.balVal, fontWeight: 600 }}>{yen(summary.balTotal)}</span></div>}
        {balChange != null && <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>前月からの増減</span><span style={{ ...styles.balVal, color: balChange >= 0 ? GREEN : RED }}>{yen(balChange)}</span></div>}
      </Editable>
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

// 今月の実績と計画を比較する小カード。計画レイヤー(計画/実績/見通し)とは別に、
// サマリから一目で「計画どおり進んでいるか」を確認できるようにする。
function PlanCompareCard({ plans, config, cards, memos, monthEntries, ym }) {
  const r = useMemo(() => planVsActualForMonth(plans, config, cards, memos, monthEntries, ym), [plans, config, cards, memos, monthEntries, ym]);
  const diffColor = r.diff === 0 ? MUTED : r.diff > 0 ? GREEN : RED;
  return (
    <div style={{ marginBottom: 14 }}>
      <Editable id="sec.title" base={styles.sectionTitle}>計画との比較（{ymLabel(ym)}）</Editable>
      <div style={{ fontSize: 11.5, color: MUTED, margin: "0 4px 8px" }}>交際費（メモ）を含む計画ベースの収支です。上の「今月の収支」とは定義が異なります。</div>
      <Editable id="card.bg" base={styles.balCard}>
        <div style={styles.balRow}><span style={styles.balAcc}>実績</span><span style={styles.balVal}>{yen(r.actualNet)}</span></div>
        <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED }}>計画</span><span style={{ ...styles.balVal, color: MUTED }}>{yen(r.planNet)}</span></div>
        <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}>
          <span style={{ ...styles.balAcc, fontWeight: 600 }}>差（実績−計画）</span>
          <span style={{ ...styles.balVal, fontWeight: 600, color: diffColor }}>{r.diff > 0 ? "+" : ""}{yen(r.diff)}</span>
        </div>
      </Editable>
    </div>
  );
}

export function SumCell({ label, value, color }) {
  return <Editable id="sum.bg" base={styles.sumCell}><div style={styles.sumCellLabel}>{label}</div><Editable id="sum.cell" base={{ ...styles.sumCellValue, color }}>{yen(value)}</Editable></Editable>;
}
