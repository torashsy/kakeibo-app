const retailMerchant = /amazon|アマゾン|ali\s?express|アリエクスプレス/i;
const rules = [
  ["外食", /(?:すた丼|スタ丼|スタドン)屋/],
  ["コンビニ", /^cisca大手町プレイス/],
  ["商業施設", /北海道ボールパーク fビレッジ|kitte大阪|ヨコハマハンマ[ー-]ヘツド|二重橋スクエア|エキマルシェ新大阪|^メイワン$|レイクタウンカゼ|^nusentral-tr/],
  ["映画館", /^t[・･]ジョイ横浜/],
  ["セクシー系", /^ラブポ[ツッ]プ[ー-]?$/],
  ["レジャー", /マザ[ー-]ボクジヨウマキバゲ|エビスブリユワリートウキヨウ|横浜スタジアム・立売|アキタイヌステ[ー-]シヨン/],
  ["旅行・宿泊", /隠岐の島町観光協会|メルパルク広島|明友大正ろまん館/],
  ["交通費", /^出雲大社前駅$/],
  ["物販", /サイモンズショッピング|^フラッグシップストア$|a-factory skipegg/],
  ["Revolutチャージ", /^r\s*\*\*(?:6007|1079)\*$/i],
  ["物販", /^イメ[ー-]ジ・マジック.*btob/i],
  ["レジャー", /^ウォット$|^仙巌園$/],
  ["物販", /^トピコ さいとう$/],
  ["印刷サービス", /キンコ[ー-]ズ 池袋東口店/],
  ["通信費", /^wi-fiサ[ー-]ビス$/],
  ["旅行・宿泊", /^china southe784[0-9]{10}$|^ukvi etamob|ユニバーサルポートヴィータ 自動精算機|リーガプレイス 肥後橋/],
  ["交通費", /アクアネット 広島/],
  ["外食", /かどや ムスブ田町|devi corner|漁師小屋「麦穂」|仙石原茶屋|大井町トラックス 広州市場|浜菜坊|ロクトショクドウ|ぶらぶら池袋東口店|わさび大手町店|^menu\/ap$/],
  ["その他の食費", /パテイスリ[ー-]アノ|仙巌園 明石屋菓子店|ishiya 札幌大通店|トピコ 金萬|ダイナミツクベンデイングネツトワ/],
  ["物販", /株式会社秋月電子通商|anker store|^jre mall$|おみやげ処|ヤマハmリテイリング|スズキ歴史館ショップ|trio akiba|リバティー秋葉原|^メルカリ$|房の駅|四国物産館|aulumu楽天市場店|フレスタ アルパーク店|ビッグ・エー川崎宿河原|ナイスフオンテアキタテン/],
  ["レジャー", /^ベイチケ$|グランカスタマ歌舞伎町店|エドトウキヨウハクフ|アキタシ ミンゾクゲイノウデンシヨ/],
  ["デジタルサービス", /^ココデデジタル$|^fod$|^oculus qp|グラビアチヤンネルプラス/],
  ["手数料", /限定券面発行費用|カード発行料/],
  ["外食", /^(?:暴れ魚|鳥京)(?:$|[ /])/],
  ["セクシー系", /^(?:my\s*fans|rapidgator|gator premium)(?:$|[ ./])/],
  ["タクシー", /^(?:飛鳥|アスカ)自動車(?:$|[ /]|株式会社)/],
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
    if (broad(row.spendingCategory) || row.spendingCategory.endsWith("（推定）")) continue;
    const name = normalize(row.description);
    const labels = history.get(name) || new Set();
    labels.add(row.spendingCategory);
    history.set(name, labels);
  }
  const applePairs = new Map();
  const appleKey = row => [row.account, row.date, Math.abs(row.amount)].join("|");
  for (const row of rows) {
    if (!/^apple[. ]com[ /]bill$/i.test(normalize(row.description)) || !row.account || !row.amount) continue;
    const key = appleKey(row);
    const signs = applePairs.get(key) || {charges:0, refunds:0};
    if (row.amount < 0) signs.charges++; else signs.refunds++;
    applePairs.set(key, signs);
  }
  return rows.map(row => {
    const name = normalize(row.description);
    const pair = applePairs.get(appleKey(row));
    if (pair?.charges === 1 && pair.refunds === 1 && /^apple[. ]com[ /]bill$/i.test(name) && broad(row.spendingCategory))
      return {...row, spendingCategory:"Apple決済"};
    if (retailMerchant.test(name)) return {...row, spendingCategory: "物販"};
    if (!broad(row.spendingCategory)) return row;
    if (name === "株式会社さん" && Math.abs(row.amount) === 1078) return {...row, spendingCategory:"サブスク"};
    const rule = rules.find(([, pattern]) => pattern.test(name));
    const previous = history.get(name);
    const category = rule?.[0] || (previous?.size === 1 && !/amazon|aliexpress|apple\.com|楽天市場/.test(name) ? [...previous][0] : null);
    return category ? {...row, spendingCategory: category} : row;
  });
}
