// クラウド同期のマージ判定(純粋関数)。キーごとの last-write-wins。
// localMeta: { [key]: ISO文字列(ローカル最終書込) }
// localValues: { [key]: 値文字列 or null }
// remoteRows: [{ key, value, updated_at }]
// 戻り値: { toLocal: [{key,value,ts}], toPush: [key] }
//  - リモートの方が新しい → toLocal(ローカルへ反映)
//  - ローカルの方が新しい/リモートに無い → toPush(アップロード)
export function decideSync(localMeta, localValues, remoteRows) {
  const toLocal = [], toPush = [];
  const remoteByKey = new Map(remoteRows.map((r) => [r.key, r]));
  const ts = (s) => (s ? Date.parse(s) || 0 : 0);

  for (const [key, r] of remoteByKey) {
    const localTs = ts(localMeta[key]);
    const remoteTs = ts(r.updated_at);
    if (remoteTs > localTs) toLocal.push({ key, value: r.value, ts: r.updated_at });
    else if (localTs > remoteTs && localValues[key] != null) toPush.push(key);
  }
  for (const key of Object.keys(localValues)) {
    if (localValues[key] != null && !remoteByKey.has(key)) toPush.push(key);
  }
  return { toLocal, toPush };
}
