import { cardForPurchase, cardPaymentDate, cycleYm, debtValueTotal, plannedFixedItemsForCard } from './utils';
import { purchaseLabel, spendingGroup } from './spending-groups';

// Display only: never turn charge candidates or a reconciliation gap into ledger entries.
export function debitBreakdown(bill, {cards = [], debt = {}, subs = [], purchases = [], investments = [], bills = [], cutoff = 0} = {}) {
  const card = cards.find(card => card.name === bill.label);
  const ym = cycleYm(bill.date, cutoff);
  const purchaseIds = new Set(purchases.map(row=>row.id));
  const investmentRows = investments.filter(row=>row.kind==='card' && !purchaseIds.has(row.id.replace(/^mf-invest:/,'mf-card:')))
    .map(row=>({...row,description:`${row.broker} カード積立`,spendingCategory:'投資'}));
  const allPurchases = [...purchases,...investmentRows];
  const isSMCC = name => /^(SMCC Gold|smcc)$/i.test(name || '');
  const familyRows = target => allPurchases.filter(row=>row.account==='三井住友カード' && cardPaymentDate(row.date,target)===bill.date);
  // The two SMCC cards share an MF source name. Attribute that source only if the
  // full sum of charges/refunds/investments + registered payments matches one bill.
  const matchingFamilyBills = isSMCC(bill.label) ? bills.filter(other=>{
    if(!isSMCC(other.label) || other.date!==bill.date || !(other.fromFeed || other.status==='confirmed')) return false;
    const otherCard=cards.find(c=>c.name===other.label);
    const rows=familyRows(otherCard);
    return rows.length>0 && -rows.reduce((sum,row)=>sum+row.amount,0)+debtValueTotal(debt?.[other.label]?.[ym])===other.amount;
  }) : [];
  const familyMatched = matchingFamilyBills.length===1 && matchingFamilyBills[0].id===bill.id;
  const candidates = bill.kind === 'card' && card ? allPurchases.filter(row =>
    (cardForPurchase(row.account, cards)?.name === card.name || (familyMatched && row.account==='三井住友カード')) && cardPaymentDate(row.date, card) === bill.date) : [];
  const lines = candidates.map(row => ({
    id: row.id, date: row.date, label: purchaseLabel(row) || '利用先未確認', account: row.account,
    amount: -row.amount, group: spendingGroup(row)?.[0] || (row.spendingCategory === '投資' ? 'カード積立' : 'チャージ'),
  })).sort((a,b) => Math.abs(b.amount)-Math.abs(a.amount) || a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const purchaseTotal = lines.reduce((sum, row) => sum + row.amount, 0);
  const rawDebt = bill.kind === 'card' ? debt?.[card?.name]?.[ym] : null;
  const debtTotal = debtValueTotal(rawDebt);
  const debtLines = Array.isArray(rawDebt?.items)
    ? rawDebt.items.filter(row => Number(row.amount)).map((row,i) => ({id:row.id || `debt-${i}`, label:row.label?.trim() || '利用先未登録', amount:Number(row.amount)}))
    : debtTotal ? [{id:'debt', label:'利用先未登録', amount:debtTotal}] : [];
  // A recurring plan substitutes for absent purchases; it is not added again to actual charges.
  const fixedLines = bill.kind === 'fixed' ? [{id:bill.id, label:bill.label, amount:bill.amount}]
    : lines.length ? [] : plannedFixedItemsForCard(subs, cards, bill.label, ym, cutoff);
  const fixedTotal = fixedLines.reduce((sum,row) => sum + row.amount, 0);
  const detailTotal = purchaseTotal + debtTotal + fixedTotal;
  const groups = new Map();
  for (const line of lines) groups.set(line.group, (groups.get(line.group) || 0) + line.amount);
  return {
    lines, debtLines, fixedLines, purchaseTotal, debtTotal, fixedTotal, detailTotal,
    difference: bill.amount - detailTotal,
    groups: [...groups].map(([label,amount]) => ({label,amount})).sort((a,b)=>b.amount-a.amount),
    inferred: bill.kind === 'card', familyMatched,
  };
}
