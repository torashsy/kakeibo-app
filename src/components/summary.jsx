import React from "react";
import { ACCENT, ACCENT_SOFT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen } from '../utils.js';
import { styles } from '../styles.js';
import { Editable } from '../edit.jsx';

export function Summary({ summary, prevBalTotal }) {
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
      <Editable id="sec.title" base={styles.sectionTitle}>口座残高</Editable>
      <Editable id="card.bg" base={styles.balCard}>
        {!hasBal && <div style={{ color: MUTED, fontSize: 13, padding: "6px 2px" }}>この月の残高記録はまだありません</div>}
        {Object.entries(summary.balances).map(([acc, v]) => <Editable key={acc} id="bal.row" base={styles.balRow}><span style={styles.balAcc}>{acc}</span><span style={styles.balVal}>{yen(v)}</span></Editable>)}
        {hasBal && <div style={{ ...styles.balRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 10 }}><span style={{ ...styles.balAcc, fontWeight: 700 }}>合計</span><span style={{ ...styles.balVal, fontWeight: 700 }}>{yen(summary.balTotal)}</span></div>}
        {balChange != null && <div style={styles.balRow}><span style={{ ...styles.balAcc, color: MUTED, fontSize: 13 }}>前月からの増減</span><span style={{ ...styles.balVal, color: balChange >= 0 ? GREEN : RED, fontSize: 14 }}>{yen(balChange)}</span></div>}
      </Editable>
      {balChange != null && (() => {
        const diff = balChange - summary.net;
        const ok = Math.abs(diff) < 1;
        return (
          <div style={{ ...styles.checkCard, background: ok ? ACCENT_SOFT : "#FBEEE9" }}>
            {ok ? <span style={{ color: ACCENT, fontSize: 12.5 }}>✓ 残高の増減と収支が一致しています</span>
              : <span style={{ color: RED, fontSize: 12.5 }}>⚠ 残高増減と収支に {yen(Math.abs(diff))} のズレがあります（入力もれの可能性）</span>}
          </div>
        );
      })()}
    </div>
  );
}

export function SumCell({ label, value, color }) {
  return <Editable id="sum.bg" base={styles.sumCell}><div style={styles.sumCellLabel}>{label}</div><Editable id="sum.cell" base={{ ...styles.sumCellValue, color }}>{yen(value)}</Editable></Editable>;
}
