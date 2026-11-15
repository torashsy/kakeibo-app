const groups = [
  ["食費", "#bf663e", ["食料品","外食","その他の食費","食費","飲み会"]],
  ["買い物", "#c07591", ["物販","商業施設","コンビニ","衣服","日用品","スマホ用品","住まい用品","家電・電子機器","家具・家電","カメラ用品","ドラッグストア","健康食品・サプリ"]],
  ["交通・旅行", "#537fae", ["交通費","タクシー","旅行・宿泊","旅行"]],
  ["サブスク", "#857345", ["サブスク"]],
  ["生活・サービス", "#408a76", [
    "携帯代","通信費","インターネット","その他通信費","水道・光熱費","住宅","放送視聴料",
    "健康・医療","医療費","美容院・理髪","ボディケア","保険","その他保険","税・社会保障",
    "ゲーム","書籍・漫画","書籍","レジャー","交際費","チケット代","映画館","試験料","セクシー系",
    "趣味・娯楽","教養・教育","大学関連","学費","映画・音楽・ゲーム","アウトドア",
    "事業経費","還元","その他入金","手数料","寄付","ドメイン費","印刷サービス","宅配便・運送",
    "デジタル購入","デジタルサービス","Apple決済","優待サービス",
  ]],
  ["用途未確認", "#838995", ["未分類","通販（商品不明）","電子マネー","情報サービス"]],
];
const byCategory = new Map(groups.flatMap(group => group[2].map(category=>[category,group])));
export function spendingGroup(row) {
  const category = (row.spendingCategory || "").replace(/（推定）$/, "");
  if (category === "投資" || category === "Revolutチャージ") return null;
  const source = category === "その他の分類済み" || !category
    ? byCategory.get(row.mfMinor) || byCategory.get(row.mfMajor)
    : byCategory.get(category);
  return source || byCategory.get("未分類");
}
export const purchaseLabel = row => row.appleProduct || (row.appleBilling ? "Apple（商品未確認）" : row.subscriptionLabel || row.description);

export function needsPurposeReview(row) {
  return spendingGroup(row)?.[0] === "用途未確認" || (row.appleBilling === true && !row.appleProduct);
}
