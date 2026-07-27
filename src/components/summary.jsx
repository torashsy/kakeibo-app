import React, { useMemo, useState } from "react";
import { ACCENT, ACCENT_SOFT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, periodLabel, acctRole, planVsActualForMonth, annualOutlook, cardBreakdown, balanceReachesCycleEnd, cycleEndDate } from '../utils';
import { styles } from '../styles.js';

export function Summary({ summary, balancesNow, prevBalTotal, plans, subs, config, cards, debt, memos, monthEntries, entries, closedMonths, ym, onOpenPlan, onOpenClose, onOpenImport }) {
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
  const hasBreakdown = breakdown.length > 0;
  return (
    <div style={{ padding: "4px 2px" }}>
      <div style={styles.heroCard}>
        <div style={styles.heroLabel}>今月の収支</div>
        <div
          style={{ ...styles.heroValue, color: summary.net >= 0 ? "#fff" : "#FFD9CF" }}>{yen(summary.net)}</div>
        <div style={styles.heroSub}>収入 {yen(summary.income)}　−　支出 {yen(summary.expense)}</div>
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
      </div>
      {cardOpen && hasBreakdown && <CardBreakdownPanel rows={breakdown} />}
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
function CardBreakdownPanel({ rows }) {
  const totalAll = rows.reduce((a, r) => a + r.total, 0);
  const debtAll = rows.reduce((a, r) => a + r.debtPortion, 0);
  const otherAll = rows.reduce((a, r) => a + r.otherPortion, 0);
  return (
    <div style={{ ...styles.detailCard, marginBottom: 14 }}>
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

export function SumCell({ label, value, color }) {
  return <div style={styles.sumCell}><div style={styles.sumCellLabel}>{label}</div><div style={{ ...styles.sumCellValue, color }}>{yen(value)}</div></div>;
}
