import { spendingGroup, purchaseLabel, needsPurposeReview } from "../spending-groups";
import { IncomeLines } from "./income-lines";
import { PendingPurchases } from "./pending-purchases";
import { CashComparison } from "./cash-comparison";
import { classifyCardRows } from "../card-purposes";
import React, { useMemo, useState } from "react";
import { ACCENT, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, ymLabel, periodLabel, parseTxnKey, acctRole, planVsActualForMonth, annualOutlook, cardBreakdown, cardClaimStates, upcomingDebits, cycleYm, balanceReachesCycleEnd, cycleEndDate, cycleStartDate, addMonth, computeSummary } from '../utils';
import "./home.css";
import { PayrollReport } from "./payroll-report";
import { bankTransactions } from "../bank-feed";
import { styles } from '../styles.js';

export function Summary({ section, onSection, forecasts, paySlips, snapshot, scheduledDebits, summary, balancesNow, prevBalTotal, plans, subs, config, cards, debt, memos, monthEntries, entries, closedMonths, ym, onOpenPlan, onOpenCards }) {
  const setSection = onSection;
  const [spendingView, setSpendingView] = useState(null);
  const openSpending = (basis, label) => {
    setSpendingView({ basis, label, ym });
    setSection("spend");
  };
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
  const showOutlook = ym >= cycleYm(new Date().toLocaleDateString('sv-SE'), config.cycleCutoffDay) && !closedMonths.includes(ym);
  const hasBreakdown = breakdown.length > 0 || claimStates.length > 0;
  return (
    <div className="home-overview">
      {["month","funds","invest","pay"].includes(section) && <nav className="report-sections" aria-label="家計の表示切替">
        {[["month","収支"],["funds","残高"],["invest","投資"],["pay","給与"]].map(([id,label])=>
          <button key={id} aria-current={(section===id || (id==="month" && ["flow","spend"].includes(section)))?"page":undefined} onClick={()=>setSection(id)}>{label}</button>)}
      </nav>}
      {section === "month" && <>
      <section className="overview-result">
        <CashComparison title={showOutlook ? "収支見込み" : "収支実績"}
          income={showOutlook ? forecast.income : summary.income} expense={showOutlook ? forecast.spending : summary.expense}
          net={showOutlook ? forecast.net : summary.net} incomeDetails={<IncomeLines entries={monthEntries} forecast={showOutlook ? forecast : null} plans={plans} ym={ym}/>}/>
        <div className="result-actions"><button onClick={()=>setSection("flow")}>収支実績 ›</button>{showOutlook && <button onClick={onOpenPlan}>計画 ›</button>}</div>
      </section>
      {showOutlook && <BalanceTimeline cards={cards} onOpenCards={onOpenCards} compact onExpand={()=>setSection("funds")} shown={shown} upcoming={upcoming} slips={paySlips} forecast={forecast} ym={ym} cutoff={config.cycleCutoffDay} />}

      <SpendingPurpose compact onOpen={openSpending} purchases={purchases} ym={ym} cutoff={config.cycleCutoffDay} />
      </>}
      {section === "spend" && <SpendingPurpose initialView={spendingView} purchases={purchases} ym={ym} cutoff={config.cycleCutoffDay} />}
      {section === "flow" && <>
      <section className="home-flow" aria-label="選択月の収入と支出">
        <CashComparison title="収支実績" income={summary.income} expense={summary.expense} net={summary.net} incomeDetails={<IncomeLines entries={monthEntries}/>}/>
      </section>
      <details open className="k-group"><summary>内訳・締め残高</summary>
      <MonthlySummaryTable summary={summary} cardOpen={cardOpen} setCardOpen={setCardOpen} hasBreakdown={hasBreakdown} breakdown={breakdown} claims={claimStates} />
      <AccountBalances shown={shown} hasBal={hasBal} total={balTotalNow} change={balChange} partialAccounts={partialAccounts} config={config} ym={ym} net={summary.net + summary.invest} />
      </details>

      <MonthlyNetChart entries={entries || []} ym={ym} />
      </>}
      {section === "funds" && <>
      {showOutlook && <BalanceTimeline cards={cards} onOpenCards={onOpenCards} shown={shown} upcoming={upcoming} slips={paySlips} forecast={forecast} ym={ym} cutoff={config.cycleCutoffDay} />}

      {!showOutlook && !hasBal && <p>この月の口座残高は未登録です。</p>}
      {!showOutlook && <AccountBalances shown={shown} hasBal={hasBal} total={balTotalNow} change={balChange} partialAccounts={partialAccounts} config={config} ym={ym} net={summary.net + summary.invest} />}
      {showOutlook && <UpcomingDebitsCard rows={upcoming} missingCount={claimStates.filter((row) => !row.due).length} onOpenCards={onOpenCards} />}
      {showOutlook && <section className="k-group">
        <h3>{periodLabel(ym, config.cycleCutoffDay)}の収支見込み　{yen(forecast.net)}</h3>
        {[["給与",forecast.salaryIncome,forecast.salaryRecorded], ["その他収入",forecast.otherIncome,forecast.otherRecorded],
          ["支出",forecast.spending,forecast.spendingSource], ["投資振替",forecast.invest,forecast.investRecorded]].map(([label,amount,source]) =>
          <div key={label} style={alignedRow}><span>{label} <small>{typeof source === "string" ? source : source ? "実績" : "計画"}</small></span><strong style={alignedAmount}>{yen(amount)}</strong></div>)}
      </section>}
      {showOutlook && <SpendingMeter plans={plans} subs={subs} cards={cards} debt={debt} monthEntries={monthEntries} ym={ym} startDay={config.cycleCutoffDay} />}
      {showOutlook && <AnnualOutlookCard forecasts={forecasts} plans={plans} subs={subs} cards={cards} debt={debt} entries={entries} closedMonths={closedMonths} config={config} ym={ym} onOpenPlan={onOpenPlan} />}

      </>}
      {section === "invest" && <InvestmentDetails entries={monthEntries} snapshot={snapshot} ym={ym} cutoff={config.cycleCutoffDay} />}
      {section === "pay" && <PayrollReport key={ym} slips={paySlips} ym={ym} />}
    </div>
  );
}
function BalanceTimeline({ cards, onOpenCards, compact, onExpand, shown, upcoming, slips, forecast, ym, cutoff }) {
  const today = new Date().toLocaleDateString("sv-SE");
  if (ym !== cycleYm(today, cutoff)) return null;
  const accounts = Object.entries(shown);
  if (!accounts.length) return compact ? null : <section className="k-group"><h3>残高の見通し</h3><p>口座残高の取得待ちです。</p></section>;
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
  const lowest = points.reduce((min, point) => point.amount < min.amount ? point : min);
  if (compact) {
    const bills = upcoming.filter(row => row.kind === "card" && row.amount > 0);
    const nextDate = bills[0]?.date;
    const next = bills.filter(row => row.date === nextDate);
    const afterDebit = points.find(point => point.date === nextDate);
    const depositsBeforeDebit = events.filter(event => event.date <= nextDate && event.change > 0);
    const totals = new Map();
    for (const bill of next) {
      const name = cards?.find(card => card.name === bill.label)?.paymentAccount || "";
      totals.set(name, (totals.get(name) || 0) + bill.amount);
    }
    return <section className="cash-position"><button className="all-balances" onClick={onExpand}>
      <span>口座残高 <small>{accounts.length}口座合計</small></span><b>{yen(start)}</b><span aria-hidden="true">›</span></button>
      {depositsBeforeDebit.map((event,index)=><div className="before-debit" key={event.date+index}>
        <span><time className="date-slot">{shortDate(event.date)}</time>{event.label.startsWith("給与（計画")?"給与入金見込み":event.label}</span><b>＋{yen(event.change)}</b>
      </div>)}
      {next.length > 0 && <details className="next-claim"><summary>
        <span><time className="date-slot">{shortDate(nextDate)}</time>カード引落予定</span><b>{yen(next.reduce((sum,r)=>sum+r.amount,0))}</b></summary>
        {next.map(r=><div className="claim-row" key={r.id}><span>{r.label}</span><b>{yen(r.amount)}</b></div>)}
        {[...totals].map(([name,amount])=> {
          const bal = shown[name];
          return name && bal ? <div key={name} className="claim-account"><span>{name} · {bal.asOf || bal.ym+"月度"} 残高</span><b>{yen(bal.amount)}</b><span>この請求を引いた残額</span><strong>{yen(bal.amount-amount)}</strong></div> :
            <div key={name} className="claim-row">{name ? name+"の残高未取得" : "引落口座は未登録"}{!name && <button onClick={onOpenCards}>カード管理 ›</button>}</div>;
        })}
      </details>}
      {afterDebit && <div className="after-debit"><span><time className="date-slot">{shortDate(nextDate)}</time>引落後の見込み<small>{accounts.length}口座合計{salaryNote ? " · 給与未算入" : ""}</small></span><b>{yen(afterDebit.amount)}</b></div>}
    </section>;

  }
  return <section className="k-group home-balance" aria-label="残高の見通し">
    <h3>全口座の残高見通し</h3><details className="home-accounts"><summary><span>現在</span><strong>{yen(start)}</strong><small>口座別 ›</small></summary>
      {accounts.map(([name,row]) => <div style={styles.settingRow} key={name}><span>{name}　<small>{row.asOf || row.ym + "月度"}</small></span><b>{yen(row.amount)}</b></div>)}
    </details>
    {points.length > 1 ? <>
      <table className="balance-events"><thead><tr><th>日付</th><th>入出金予定</th><th>全口座計</th></tr></thead>
        <tbody>{points.slice(1).map(({date,rows,amount}) => <tr key={date}>
          <th scope="row">{shortDate(date)}</th>
          <td>{rows.map((row,i) => <div key={i}><span>{row.label}</span><b>{row.change>0 ? "+" : ""}{yen(row.change)}</b></div>)}</td>
          <td>{yen(amount)}</td>
        </tr>)}</tbody>
      </table>
      <div className="balance-axis"><span>最低 · {shortDate(lowest.date)}<b>{yen(lowest.amount)}</b></span><span>締め日 · {shortDate(end)}<b>{yen(points.at(-1).amount)}</b></span></div>
    </> : <p>登録予定なし</p>}
    {salaryNote && <small>{salaryNote}</small>}
  </section>;
}
function SubscriptionServices({ rows }) {
  const byService = new Map();
  for (const row of rows) {
    const name = row.subscriptionLabel || row.description?.trim() || "利用先未確認";
    if (!byService.has(name)) byService.set(name,{name,amount:0,rows:[]});
    const service = byService.get(name);
    service.amount -= row.amount;
    service.rows.push(row);
  }
  return <div className="subscription-services">{[...byService.values()].sort((a,b)=>b.amount-a.amount).map(service=>
    <details key={service.name}><summary><span>{service.name}</span><b>{yen(service.amount)}</b></summary>
      {service.rows.map(row=><div key={row.id}><time>{shortDate(row.date)}</time><span>{row.account}{row.spendingCategory?.endsWith("（推定）") && <small> · 推定</small>}</span><b>{row.amount>0?"返金 ":""}{yen(Math.abs(row.amount))}</b></div>)}
    </details>)}</div>;
}
function PurchaseLines({ rows, apple=false, showCategory=false }) {
  return <div className="spend-transactions">{rows.map(row=><div key={row.id}>
    <time dateTime={row.date}>{shortDate(row.date)}</time>
    <span>{purchaseLabel(row)}{apple && <small>{row.appleProduct ? row.spendingCategory : row.account}</small>}{showCategory && <small>{row.spendingCategory==="その他の分類済み" ? row.mfMinor || row.mfMajor : row.spendingCategory}</small>}</span>
    <b>{row.amount>0?"返金 ":""}{yen(Math.abs(row.amount))}</b>
  </div>)}</div>;
}
function CardLedger({ rows }) {
  const [query, setQuery] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [limit, setLimit] = useState(20);
  const normalize = text => text.normalize("NFKC").toLowerCase();
  const needle = normalize(query.trim());
  const pending = rows.filter(needsPurposeReview).length;
  const review = pending > 0 && reviewOnly;
  const matches = rows.filter(row => (!review || needsPurposeReview(row)) &&
    (!needle || normalize([purchaseLabel(row), row.account, row.description, spendingGroup(row)?.[0]].join(" ")).includes(needle)));
  return <div className="card-ledger">
    <div className="ledger-tools"><input type="search" aria-label="明細を検索" placeholder="店名・カード名で検索" value={query}
      onChange={e=>{setQuery(e.target.value);setLimit(20);}}/>
      {pending>0 && <button aria-pressed={review} onClick={()=>{setReviewOnly(!review);setLimit(20);}}>要確認 {pending}件</button>}
    </div>
    <ul>{matches.slice(0,limit).map(row=><li key={row.id}>
      <time dateTime={row.date}>{row.date.slice(5).replace("-", "/")}</time>
      <span className="ledger-merchant">{purchaseLabel(row)}<small>{needsPurposeReview(row) ? "用途未確認" : spendingGroup(row)?.[0]} · {row.account}</small></span>
      <b className={row.amount>0 ? "ledger-refund" : undefined}>{row.amount>0 && <small>返金 </small>}{yen(Math.abs(row.amount))}</b>
    </li>)}</ul>
    {!matches.length && <p role="status">該当する明細はありません</p>}
    {matches.length>limit && <button className="ledger-more" onClick={()=>setLimit(limit+20)}>続きを見る（残り{matches.length-limit}件）</button>}
  </div>;
}
export function SpendingPurpose({ compact, onOpen, purchases, ym, cutoff, initialView }) {
  const [basis, setBasis] = useState(initialView?.basis || "card");
  const [selection, setSelection] = useState(initialView);
  const [allMerchants, setAllMerchants] = useState(false);
  const monthRows = purchases.filter(row => cycleYm(row.date, cutoff) === ym && spendingGroup(row));
  const appleRows = monthRows.filter(row => row.appleBilling);
  const view = basis === "apple" && !appleRows.length ? "category" : basis;
  const total = rows => -rows.reduce((sum, row) => sum + row.amount, 0);
  const groups = new Map();
  for (const row of monthRows) {
    let label = spendingGroup(row)[0];
    if (view === "card") label = row.account?.trim() || "カード名未確認";
    if (view === "merchant") label = row.appleBilling ? "Apple" : row.subscriptionLabel || row.description?.trim() || "利用先未確認";
    if (!groups.has(label)) groups.set(label, {label, amount: 0, rows: []});
    const group = groups.get(label);
    group.amount -= row.amount;
    group.rows.push(row);
  }
  const pending = view === "category" && groups.get("用途未確認");
  const ranked = [...groups.values()].filter(g => g !== pending)
    .sort((a,b) => b.amount - a.amount || a.label.localeCompare(b.label, "ja"));
  const max = Math.max(1, ...ranked.map(g => Math.abs(g.amount)));
  const shown = compact ? ranked.slice(0,3) : view === "merchant" && !allMerchants ? ranked.slice(0,5) : ranked;
  const views = compact ? [["card","カード別"],["category","用途別"]] :
    [["card","カード別"],["category","用途別"],["ledger","明細"],["merchant","利用先別"],...(appleRows.length ? [["apple","Apple決済"]] : [])];
  return <section className="purchase-report" aria-label="カード利用額">
    <header><h3>{Number(ym.slice(5))}月度のカード利用額</h3><strong>{yen(total(view === "apple" ? appleRows : monthRows))}</strong></header>
    {monthRows.length ? <>
      <div className="purchase-views" role="group" aria-label="集計の切替">
        {views.map(([id,label]) => <button key={id} aria-pressed={view === id}
          onClick={() => {setBasis(id); setSelection(null); setAllMerchants(false);}}>{label}</button>)}
      </div>
      {view === "ledger" ? <CardLedger key={ym} rows={monthRows}/> :
        view === "apple" ? <PurchaseLines rows={appleRows} apple/> :
        shown.map(g => {
          const open = !compact && selection?.ym === ym && selection?.label === g.label;
          return <div className="purchase-group" key={g.label}>
            <button type="button" className="purchase-rank" aria-expanded={compact ? undefined : open}
              onClick={() => compact ? onOpen(view, g.label) : setSelection(open ? null : {ym, label:g.label})}>
              <span className="purchase-name">{g.label}</span>
              <b>{g.amount < 0 && <small>返金超過 </small>}{yen(g.amount)}</b>
              <span className="purchase-chevron" aria-hidden="true">{open ? "⌄" : "›"}</span>
              <span className="purchase-track" aria-hidden="true"><i data-refund={g.amount < 0}
                style={{width: 100 * Math.abs(g.amount) / max + "%"}}/></span>
            </button>
            {open && (view === "category" && g.label === "サブスク" ? <SubscriptionServices rows={g.rows}/> :
              <PurchaseLines rows={g.rows} showCategory={view === "category" && g.label === "生活・サービス"}/>)}
          </div>;
        })}
      {pending && <PendingPurchases key={ym} rows={pending.rows}/>}
      {compact && <button className="purchase-more" onClick={() => onOpen(view)}>{view === "card" ? "すべてのカード" : "すべての用途"}を見る ›</button>}
      {!compact && view === "merchant" && ranked.length > 5 && <button className="purchase-more" onClick={() => setAllMerchants(!allMerchants)}>
        {allMerchants ? "上位5件に戻る" : "すべての利用先を見る"}</button>}
    </> : <p>この月度のカード利用明細はありません。</p>}
  </section>;
}
function InvestmentDetails({ entries, snapshot, ym, cutoff }) {
  const bank = entries.filter(e => e.cat === "account" && acctRole(e.item) === "transfer");
  const cards = Object.values(snapshot?.investmentCardRows || {}).filter(r => cycleYm(r.date, cutoff) === ym);
  const groups = new Map();
  for (const [rows, method] of [[bank,"銀行振替"],[cards,"カード積立"]]) {
    for (const row of rows) {
      const txn = parseTxnKey(row.src);
      const description = [row.note, row.description, txn?.desc].filter(Boolean).join(" ");
      const name = row.broker || row.destination || (description.match(/大和コネクト証券|楽天証券|松井証券|マネックス証券|野村證券/i)?.[0])
        || (/SBI証券/i.test(description) ? "SBI証券" : /ハイブリッド預金/.test(description) ? "SBIハイブリッド預金" : "振替先未確認");
      if (!groups.has(name)) groups.set(name, {name, invested:0, returned:0, rows:[]});
      const group = groups.get(name);
      group.invested += Math.max(0,-row.amount);
      group.returned += Math.max(0,row.amount);
      group.rows.push({id:row.id, date:row.date || txn?.date, method, amount:-row.amount});
    }
  }
  if (!groups.size) return <p>この月の投資記録はありません。</p>;
  const ranked = [...groups.values()].sort((a,b)=> b.invested-a.invested);
  const total = ranked.reduce((sum,g)=>sum+g.invested,0);
  const returned = ranked.reduce((sum,g)=>sum+g.returned,0);
  return <section className="statement portfolio"><h3>投資への純振替</h3><strong className="statement-total">{yen(total-returned)}</strong>
    <div className="invest-directions">{[["投資へ",total],["口座へ戻った額",returned]].map(([label,amount])=>
      <div key={label}><span>{label}</span><b>{yen(amount)}</b><i aria-hidden="true" style={{width:100*amount/Math.max(total,returned,1)+"%"}}/></div>)}</div>
    <h4 className="list-heading">振替先別</h4>
    {ranked.map(g=><details className="destination" key={g.name}><summary>
      <span>{g.name}{ranked.length>1 && <small>{total ? Math.round(100*g.invested/total) : 0}%</small>}</span><b>{yen(g.invested)}</b>
      <small className="action-caption">明細 {g.rows.length}件 ›</small>
      {ranked.length>1 && <i className="destination-share" style={{width:(total ? 100*g.invested/total : 0)+"%"}}/>}
    </summary>{g.rows.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(r=><div className="statement-line" key={r.id}><span><time className="date-slot">{shortDate(r.date)}</time>{r.method}{r.amount<0?"・戻し":""}</span><b>{yen(r.amount)}</b></div>)}
    </details>)}
    {ranked.filter(g=>ranked.length>1 && g.returned>0).map(g=><div key={g.name} className="statement-line"><span>{g.name}からの戻り</span><b>{yen(g.returned)}</b></div>)}
  </section>;
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
  const [open, setOpen] = useState(true);
  
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


