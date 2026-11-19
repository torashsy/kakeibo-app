import { normalizePoints, validDay, localDay } from './deadlines';

const fields = ['name','amount','unit','kind','expiresOn','expiryMode','status','note'];
// Snapshots are balances, never earnings to add to an earlier balance or to the cash ledger.
export function reconcilePoints(saved = [], feed, today = localDay()) {
  if (!feed?.pointBalances) return saved;
  const result = [...saved];
  for (const source of Object.values(feed.pointBalances)) {
    if (!source?.id || !source.name || !source.evidence || !validDay(source.asOf) || source.asOf > today || !Number.isSafeInteger(source.amount) || source.amount < 0 || !['pt','mile','yenEquivalent'].includes(source.unit)) continue;
    const [row] = normalizePoints([{...source,id:`synced-point:${source.id}`,updatedOn:source.asOf}]);
    row.pointSync = {key:source.id,asOf:source.asOf,evidence:source.evidence,base:Object.fromEntries(fields.map(k=>[k,row[k]??'']))};
    const index = result.findIndex(p=>p.pointSync?.key===source.id);
    if(index<0){result.push(row);continue;}
    const old=result[index],base=old.pointSync.base;
    if(old.pointSync.asOf>source.asOf)continue;
    const merged={...old,pointSync:row.pointSync,asOf:source.asOf};
    for(const key of fields)if(base && (old[key]??'')===(base[key]??''))merged[key]=row[key];
    result[index]=merged;
  }
  return result;
}
