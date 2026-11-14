const rules = [
  ["交通費", /市営地下鉄.*タッチ決済|小田急(?:電鉄|乗車券)|えきねっと/],
  ["携帯代", /y\.u\s*mobileサービス利用料|楽天モバイル通信料/],
  ["サブスク", /ラジコ.*タイムフリー30/],
  ["保険", /第一ネオ生命/],
  ["書籍・漫画", /講談社friday|ヤンジャン!|ヤンマガclub/],
  ["旅行・宿泊", /klook travel|トリップドットコム|agoda|滝と蕎麦の宿/],
  ["外食", /ロイヤルココナッツガ[ー-]デン|ど・みそ丸ノ内店|^福園(?:\s|\/|$)/],
  ["ゲーム", /steamgames\.com/],
  ["通販（商品不明）", /amazon market\s*place|aliexpress/],
  ["還元", /visamobile2cashback|visatransit3cashback/],
];
export function classifyCardRows(rows) {
  const normalize = value => value.normalize("NFKC").toLowerCase().replace(/\s*\(返品\)$/, "").trim();
  const history = new Map();
  const broad = category => !category || ["未分類","その他の分類済み"].includes(category);
  for (const row of rows) {
    if (broad(row.spendingCategory)) continue;
    const name = normalize(row.description);
    const labels = history.get(name) || new Set();
    labels.add(row.spendingCategory);
    history.set(name, labels);
  }
  return rows.map(row => {
    if (!broad(row.spendingCategory)) return row;
    const name = normalize(row.description);
    const rule = rules.find(([, pattern]) => pattern.test(name));
    const previous = history.get(name);
    const category = rule?.[0] || (previous?.size === 1 && !/amazon|aliexpress|apple\.com|楽天市場/.test(name) ? [...previous][0] : null);
    return category ? {...row, spendingCategory: category} : row;
  });
}
