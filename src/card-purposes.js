const retailMerchant = /amazon|アマゾン|ali\s?express|アリエクスプレス/i;
const rules = [
  ["外食", /成吉思汗だるま|イタリア料理|俺のイタリアン|farm diner|大衆酒場|shokudo pastavola|出雲そば|麺屋雪風|俺流塩らーめん|焼きあご塩ら|麺屋武蔵|壱角堂|元祖串八珍|大阪王将|サブウェイ 南池袋|天文館むじゃき|松屋 徳島|マリオンクレ[ー-]プ/],
  ["交通費", /隠岐汽船|丸文松島汽船|express rail link|札幌市電|神戸市営地下鉄/],
  ["レジャー", /dartsup|美術館|多摩六都科学館|箱根強羅公園|快活club|マンボ[ー-](?:プラス|池袋|千葉)/],
  ["ゲーム", /^nintendo (?:cb|cc|jc)\d/],
  ["サブスク", /amazonプライム会費|ラジコ タイムフリ[ー-]30/],
  ["デジタルサービス", /アベマテイーヴイー|seedance.*seevio|elevenlabs\.io|venice\.ai|morisawa fonts|^anthropic |アドビカブシキガイシヤ/],
  ["還元", /visashop2cashback/],
  ["外食", /海鮮屋台おくまん|三代目 鳥メロ|満天酒場|ちばチャンバル|ギヨウザサカバ|リストランテ マンジャ|味ん味ん|てけてけ 高田馬場/],
  ["交通費", /^eurailct$/],
  ["レジャー", /usj ticket store/],
  ["試験料", /宅建試験不動産適正取引推進機構/],
  ["還元", /スマホ決済利用20%還元/],
  ["交通費", /市営地下鉄.*タッチ決済|小田急(?:電鉄|乗車券)|えきねっと/],
  ["携帯代", /y\.u\s*mobileサービス利用料|楽天モバイル通信料/],
  ["サブスク", /ラジコ.*タイムフリー30/],
  ["保険", /第一ネオ生命/],
  ["書籍・漫画", /講談社friday|ヤンジャン!|ヤンマガclub/],
  ["旅行・宿泊", /klook travel|トリップドットコム|agoda|滝と蕎麦の宿/],
  ["外食", /ロイヤルココナッツガ[ー-]デン|ど・みそ丸ノ内店|^福園(?:\s|\/|$)/],
  ["ゲーム", /steamgames\.com/],
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
    const name = normalize(row.description);
    if (retailMerchant.test(name)) return {...row, spendingCategory: "物販"};
    if (!broad(row.spendingCategory)) return row;
    const rule = rules.find(([, pattern]) => pattern.test(name));
    const previous = history.get(name);
    const category = rule?.[0] || (previous?.size === 1 && !/amazon|aliexpress|apple\.com|楽天市場/.test(name) ? [...previous][0] : null);
    return category ? {...row, spendingCategory: category} : row;
  });
}
