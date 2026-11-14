import { classifyCardRows } from "../card-purposes";
import React, { useMemo, useState } from "react";
import { ACCENT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, periodLabel, acctRole, planVsActualForMonth, annualOutlook, cardBreakdown, cardClaimStates, upcomingDebits, cycleYm, balanceReachesCycleEnd, cycleEndDate, cycleStartDate, addMonth, computeSummary } from '../utils';
import "./home.css";
import { PayrollReport } from "./payroll-report";
import { bankTransactions } from "../bank-feed";
import { styles } from '../styles.js';

export function Summary({ forecasts, paySlips, snapshot, scheduledDebits, summary, balancesNow, prevBalTotal, plans, subs, config, cards, debt, memos, monthEntries, entries, closedMonths, ym, onOpenPlan, onOpenCards }) {
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
  const purchases = useMemo(() => classifyCardRows(bankTransactions(snapshot).filter(row => row.id.startsWith("mf-card:"))), [snapshot]);
  const upcoming = useMemo(() => upcomingDebits(entries || [], cards, debt || {}, subs, config.cycleCutoffDay, ym, undefined, 30, scheduledDebits, purchases), [entries, cards, debt, subs, config.cycleCutoffDay, ym, scheduledDebits, purchases]);
  const forecast = forecasts[ym];
  const hasBreakdown = breakdown.length > 0 || claimStates.length > 0;
  return (
    <div className="home-overview">
      <section className="home-flow" aria-label="選択月の収入と支出">
        <header><h3>月間収支</h3><span>{ymLabel(ym)}</span></header>
        <strong className="flow-net">{summary.net > 0 ? "+" : ""}{yen(summary.net)}</strong>
        <div className="flow-comparison">
          {[["収入",summary.income,GREEN],["支出",summary.expense,RED]].map(([label,value,color]) =>
            <div key={label}><span>{label}</span><b>{yen(value)}</b>
              <div className="flow-track" aria-hidden="true"><i style={{background:color,width:Math.abs(value)/Math.max(1,Math.abs(summary.income),Math.abs(summary.expense))*100+"%"}}/></div>
            </div>)}
        </div>
      </section>
      <SpendingPurpose purchases={purchases} ym={ym} cutoff={config.cycleCutoffDay} />
      <BalanceTimeline shown={shown} upcoming={upcoming} slips={paySlips} forecast={forecast} ym={ym} cutoff={config.cycleCutoffDay} />

      <details className="k-group"><summary>月度の詳細</summary>
      <details className="k-group">
        <summary>{periodLabel(ym, config.cycleCutoffDay)}の収支見込み　{yen(forecast.net)}</summary>
        {[["給与",forecast.salaryIncome,forecast.salaryRecorded], ["その他収入",forecast.otherIncome,forecast.otherRecorded],
          ["支出",forecast.spending,forecast.spendingSource], ["投資振替",forecast.invest,forecast.investRecorded]].map(([label,amount,source]) =>
          <div key={label} style={alignedRow}><span>{label} <small>{typeof source === "string" ? source : source ? "実績" : "計画"}</small></span><strong style={alignedAmount}>{yen(amount)}</strong></div>)}
      </details>
      <UpcomingDebitsCard rows={upcoming} missingCount={claimStates.filter((row) => !row.due).length} onOpenCards={onOpenCards} />
      <InvestmentDetails entries={monthEntries} snapshot={snapshot} ym={ym} cutoff={config.cycleCutoffDay} />
      {Object.keys(paySlips || {}).length > 0 && <details className="k-group"><summary>給与・賞与の明細</summary><PayrollReport slips={paySlips} /></details>}
      <details className="k-group"><summary>今月の収支内訳・締め残高</summary>
      <MonthlySummaryTable summary={summary} cardOpen={cardOpen} setCardOpen={setCardOpen} hasBreakdown={hasBreakdown} breakdown={breakdown} claims={claimStates} />
      <AccountBalances shown={shown} hasBal={hasBal} total={balTotalNow} change={balChange} partialAccounts={partialAccounts} config={config} ym={ym} net={summary.net + summary.invest} />
      </details>
      <details className="k-group"><summary>予算・年間の見通し</summary>
      <SpendingMeter plans={plans} subs={subs} cards={cards} debt={debt} monthEntries={monthEntries} ym={ym} startDay={config.cycleCutoffDay} />
      <AnnualOutlookCard forecasts={forecasts} plans={plans} subs={subs} cards={cards} debt={debt} entries={entries} closedMonths={closedMonths} config={config} ym={ym} onOpenPlan={onOpenPlan} />
      <MonthlyNetChart entries={entries || []} ym={ym} />
      </details>
      </details>
    </div>
  );
}
function BalanceTimeline({ shown, upcoming, slips, forecast, ym, cutoff }) {
  const today = new Date().toLocaleDateString("sv-SE");
  if (ym !== cycleYm(today, cutoff)) return null;
  const accounts = Object.entries(shown);
  if (!accounts.length) return <section className="k-group"><h3>残高の見通し</h3><p>口座残高の取得待ちです。</p></section>;
  const start = accounts.reduce((sum, [, row]) => sum + row.amount, 0);
  const events = upcoming.filter(row => row.kind === "card").map(row => ({
    date: row.date, label: row.label, change: -row.amount
  }));
  const end = cycleEndDate(ym, cutoff);
  const payroll = Object.values(slips || {});
  const future = payroll.filter(row => row.date > today && row.date <= end);
  for (const row of future) events.push({date: row.date, label: row.kind + "（明細）", change: row.net});
  let salaryNote = "";
  if (!future.length && !forecast.salaryRecorded && forecast.salaryIncome > 0) {
    const counts = new Map();
    const recent = payroll.filter(row => row.date < today && !/賞与|bonus/i.test(row.kind)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
    for (const row of recent) {
      const day = row.date.slice(8,10);
      counts.set(day, (counts.get(day) || 0) + 1);
    }
    const day = [...counts].sort((a,b) => b[1] - a[1])[0]?.[0];
    const first = cycleStartDate(ym, cutoff);
    const date = day && [first.slice(0,7), end.slice(0,7)].map(month => month + "-" + day)
      .find(value => value >= first && value <= end && new Date(value).toISOString().startsWith(value));
    if (date && date > today) events.push({date, label:"給与（計画額・支給日推定）", change:forecast.salaryIncome});
    else salaryNote = "給与未算入 · 入金日未定";
  }
  const byDate = new Map();
  for (const event of events) {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push(event);
  }
  const points = [{date:today, amount:start, rows:[]}];
  for (const date of [...byDate.keys()].sort()) {
    const rows = byDate.get(date);
    const change = rows.reduce((sum, row) => sum + row.change, 0);
    points.push({date, rows, amount:points.at(-1).amount + change});
  }
  const nextDebit = points.find(point => point.rows.some(row => row.change < 0));
  const lowest = points.reduce((min, point) => point.amount < min.amount ? point : min);
  const high = Math.max(...points.map(point => point.amount));
  const span = Math.max(86400000, Date.parse(end) - Date.parse(today));
  const position = point => ({
    x:8 + 284 * (Date.parse(point.date) - Date.parse(today)) / span,
    y:high === lowest.amount ? 36 : 66 - 56 * (point.amount - lowest.amount) / (high - lowest.amount)
  });
  const line = points.map((point, index) => {
    const {x,y} = position(point);
    return index ? `H ${x} V ${y}` : `M ${x} ${y}`;
  }).join(" ") + " H 292";
  return <section className="k-group home-balance" aria-label="残高の見通し">
    <h3>これからの残高</h3><details className="home-accounts"><summary><span>現在</span><strong>{yen(start)}</strong><small>口座別 ›</small></summary>
      {accounts.map(([name,row]) => <div style={styles.settingRow} key={name}><span>{name}　<small>{row.asOf || row.ym + "月度"}</small></span><b>{yen(row.amount)}</b></div>)}
    </details>
    {points.length > 1 ? <>
      {nextDebit && <div className="balance-milestone"><span>{shortDate(nextDebit.date)} 引落日の見込み残高</span><strong>{yen(nextDebit.amount)}</strong></div>}
      <figure style={{margin:"8px 0"}}>
        <svg viewBox="0 0 302 76" role="img" aria-label="登録残高から締め日までの残高見込み" style={{width:"100%",height:90}}>
          <path d={line} fill="none" stroke={ACCENT} strokeWidth="3"/>
          {points.map((point,i) => {
            const {x,y} = position(point);
            return <circle key={i} cx={x} cy={y} r={point === lowest ? 4 : 3} fill={point === lowest && point.amount < 0 ? RED : ACCENT}><title>{point.date}　{yen(point.amount)}</title></circle>;
          })}
        </svg>
        <figcaption className="balance-axis"><span>最低　{shortDate(lowest.date)}<b>{yen(lowest.amount)}</b></span><span>締め日　{shortDate(end)}<b>{yen(points.at(-1).amount)}</b></span></figcaption>
      </figure>
      <details className="home-schedule"><summary>
        <span>次の入出金</span><time dateTime={points[1].date}>{shortDate(points[1].date)}</time>
        <strong>{points[1].amount > start ? "+" : ""}{yen(points[1].amount-start)}</strong>
      </summary>
        {points.slice(1).map(({date, rows, amount}) => <div key={date} style={{padding:"8px 0"}}>
          <b>{shortDate(date)}　予定反映後 {yen(amount)}</b>
          {rows.map((row,index) => <div key={index} style={styles.settingRow}><span>{row.label}</span><span>{row.change>0 ? "+" : ""}{yen(row.change)}</span></div>)}
        </div>)}
      </details>
    </> : <p>登録予定なし</p>}
    {salaryNote && <small>{salaryNote}</small>}
  </section>;
}
const purposeGroups = [
  ["食事", "#bf663e", ["外食","食料品","その他の食費"]],
  ["暮らし", "#408a76", ["携帯代","保険","健康食品・サプリ","日用品","スマホ用品","住まい用品","家電・電子機器"]],
  ["移動・旅行", "#537fae", ["交通費","タクシー","旅行・宿泊"]],
  ["趣味・サービス", "#936bad", ["サブスク","書籍・漫画","ゲーム","レジャー","チケット代","映画館","カメラ用品","ドメイン費","試験料","デジタルサービス","セクシー系"]],
  ["その他", "#aa925a", []],
  ["物販", "#c07591", ["物販","商業施設","コンビニ"]],
  ["用途未確認", "#838995", ["未分類","通販（商品不明）"]],
];
function SpendingPurpose({ purchases, ym, cutoff }) {
  const groups = purposeGroups.map(([label,color]) => ({label,color,amount:0,rows:[]}));
  for (const row of purchases) {
    if (cycleYm(row.date, cutoff) !== ym || ["投資","Revolutチャージ"].includes(row.spendingCategory)) continue;
    const idx = purposeGroups.findIndex(([, , names]) => names.includes((row.spendingCategory || "未分類").replace(/（推定）$/, "")));
    const g = groups[idx < 0 ? 4 : idx];
    g.amount -= row.amount;
    g.rows.push(row);
  }
  const visible = groups.filter(g => g.rows.length).sort((a,b)=>b.amount-a.amount);
  const positive = visible.reduce((sum,g)=>sum+Math.max(0,g.amount),0);
  let edge = 0;
  const gradient = visible.filter(g=>g.amount>0).map(g=>{
    const from=edge; edge+=100*g.amount/positive;
    return g.color+" "+from+"% "+edge+"%";
  }).join(",");
  groups.at(-1).rows.sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
  return <section className="k-group home-spending" aria-label="カードの使い道"><header><h3>カードの使い道</h3><strong>{visible.length ? yen(visible.reduce((sum,g)=>sum+g.amount,0)) : ""}</strong></header>
    {visible.length ? <><div className="home-chart">
      <div className="purpose-ring" style={{"--ring-fill":positive?"conic-gradient("+gradient+")":"var(--line)"}} aria-hidden="true">
        {positive>0 && <span><small>{visible[0].label}</small><b>{Math.round(visible[0].amount/positive*100)}%</b></span>}
      </div>
      <div>{visible.map(g=><details key={g.label}><summary className="home-category"><i style={{background:g.color}}/><span>{g.label}</span><b>{yen(g.amount)}</b> {positive>0 && g.amount>0 && <small>{Math.round(g.amount/positive*100)}%</small>}</summary>
        {g.rows.map(r=><div key={r.id} className="home-purchase"><time dateTime={r.date}>{shortDate(r.date)}</time><span>{r.description}{r.spendingCategory?.endsWith("（推定）") && <small>{r.spendingCategory}</small>}</span><b>{r.amount>0?"返金 ":""}{yen(Math.abs(r.amount))}</b></div>)}</details>)}</div>
    </div></> : <p>利用明細なし</p>}
  </section>;
}
function InvestmentDetails({ entries, snapshot, ym, cutoff }) {
  const bank = entries.filter(e => e.cat === "account" && acctRole(e.item) === "transfer");
  const confirmed = bank.filter(e => e.mfInvestmentId || e.id?.startsWith("mf-invest:"));
  const manual = bank.filter(e => !confirmed.includes(e));
  const cards = Object.values(snapshot?.investmentCardRows || {}).filter(r => cycleYm(r.date, cutoff) === ym);
  if (!bank.length && !cards.length) return null;
  const sum = rows => rows.reduce((total, r) => total + r.amount, 0);
  return <details className="k-group"><summary>投資の内訳</summary>
    {[["銀行明細で確認した振替（差引）", confirmed, sum(confirmed)], ...(manual.length ? [["その他の登録済み振替", manual, sum(manual)]] : []), ["カード積立（利用日基準）", cards, -sum(cards)]].map(([label,rows,total]) =>
      <details key={label}><summary style={{padding:"10px 0"}}>{label}　{yen(total)}（{rows.length}件）</summary>
        {rows.slice().sort((a,b) => (a.date || "").localeCompare(b.date || "")).map(r =>
          <div key={r.id} style={{...styles.settingRow, gap:8}}><span>{r.date?.slice(5) || "日付未登録"}　{r.broker || r.note || r.account}</span><strong>{yen(label.startsWith("カード") ? -r.amount : r.amount)}</strong></div>)}
      </details>)}
    <p style={{fontSize:12}}>カード積立はカード請求の内訳です。収支への追加計上はありません。</p>
  </details>;
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
  confirmed: { label: "確定・引落未確認", color: RED, bg: "var(--expense-soft)" },
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
  
  const nextDate = rows[0]?.date;
  const nextAmount = rows.filter(row => row.date === nextDate).reduce((sum,row) => sum + row.amount, 0);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div style={{ ...styles.detailCard, padding: "0 14px", marginBottom: 10 }}>
      <button style={{ ...styles.collapseRow, borderBottom: open ? `1px solid ${LINE}` : "none" }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 600 }}><span style={{ ...styles.chev, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>次の引き落とし</span>
        <span style={{ ...alignedAmount, color: rows.length ? RED : MUTED, fontWeight: 600 }}>{rows.length ? yen(-total) : "予定額未確認"}</span>
      </button>
      {open && <div style={{ paddingBottom: 4 }}>
        {nextDate && <p><strong>{shortDate(nextDate)} の引落予定　{yen(nextAmount)}</strong></p>}
        <p style={{fontSize:12}}>カード分の合計　{rows.some(r => r.kind === "card") ? yen(rows.filter(r => r.kind === "card").reduce((sum,r) => sum + r.amount, 0)) : "金額未確認"}</p>
        {rows.map((row) => {
          const state = claimStatus[row.status];
          return (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ color: ACCENT, fontSize: 12.5, fontWeight: 600 }}>{shortDate(row.date)}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5 }}>{row.label}</span>
              <span style={{ textAlign: "right" }}>
                <span style={{ display: "block", fontFamily: "var(--num-font)", fontVariantNumeric: "var(--num-variant)", fontSize: 13.5 }}>{yen(row.amount)}</span>
                <span style={{ color: state.color, fontSize: 10.5 }}>{row.fromFeed ? "マネーフォワード予定額" : state.label}</span>
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
function AnnualOutlookCard({ forecasts, plans, subs, cards, debt, entries, closedMonths, config, ym, onOpenPlan }) {
  const o = useMemo(() => annualOutlook(plans, subs, entries || [], closedMonths, ym, debt, cards, config?.cycleCutoffDay || 0, forecasts), [forecasts, plans, subs, cards, debt, entries, closedMonths, config?.cycleCutoffDay, ym]);
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
        {diff != null && Math.abs(diff) >= 1 && <div style={{ color: RED, fontSize: 11.5, padding: "3px 0" }}>⚠ 投資振替を含む口座増減との差 {yen(Math.abs(diff))}</div>}
        {partialAccounts.length > 0 && <div style={{ color: MUTED, fontSize: 10.5, padding: "3px 0", lineHeight: 1.5 }}>{partialAccounts.map(([acc, end]) => `${acc} ${end}`).join("・")}まで未確定</div>}
      </div>}
    </div>
  );
}


