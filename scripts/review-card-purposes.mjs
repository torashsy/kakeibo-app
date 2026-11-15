import { classifyCardRows } from "../src/card-purposes.js";
import { needsPurposeReview } from "../src/spending-groups.js";

// Read the complete private bankSnapshot so earlier matches inform new charges.
const [from, through] = process.argv.slice(2);
if (![from, through].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) || from > through) {
  throw new Error("Pass an inclusive start and end date (YYYY-MM-DD)");
}
process.stdin.setEncoding("utf8");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const snapshot = JSON.parse(input.replace(/^\uFEFF/, ""));
if (snapshot.version !== 1 || !snapshot.transactions || Array.isArray(snapshot.transactions) || typeof snapshot.transactions !== "object") {
  throw new Error("Expected a complete v1 bankSnapshot");
}
const rows = Object.entries(snapshot.transactions)
  .filter(([id]) => id.startsWith("mf-card:"))
  .map(([id, row]) => {
    if (row?.id !== id || !row.date || typeof row.description !== "string" || !Number.isSafeInteger(row.amount)) {
      throw new Error("Invalid card transaction");
    }
    return row;
  });
const period = classifyCardRows(rows).filter(row => row.date >= from && row.date <= through);
const unresolved = period.filter(needsPurposeReview)
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.id.localeCompare(b.id))
  .map(({id, date, account, description, amount}) => ({id, date, account, description, amount}));
console.log(JSON.stringify({examined: period.length, unresolved}));
