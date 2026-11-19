import { readFileSync } from 'node:fs';
import { reconcileSubscriptions, subscriptionStatus, subscriptionToday } from '../src/subscription-sync.js';

// Private input on stdin: {feed: FinanceFeed, subs: Sub[], today?: YYYY-MM-DD}.
const input = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
if (!input.feed?.bankSnapshot?.transactions || !Array.isArray(input.subs)) throw new Error('Expected complete finance feed and saved subscriptions');
const today = input.today || subscriptionToday();
const rows = reconcileSubscriptions(input.subs, input.feed, today).filter(s => !s.hidden);
const summary = rows.map(s => ({id:s.id,name:s.name,plan:s.plan,amount:s.amount,cycle:s.subscriptionSync?.cycleKnown === false ? 'unknown' : s.cycle,renewal:s.renewal,endDate:s.endDate,status:subscriptionStatus(s,today),lastChargedOn:s.subscriptionSync?.lastChargedOn || '',evidence:s.subscriptionSync?.evidence || []}));
console.log(JSON.stringify({today,count:rows.length,rows:summary},null,2));
