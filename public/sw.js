// オフライン対応の最小Service Worker。
// (アプリはlocalStorage保存なので、殻さえキャッシュされていればオフラインで開ける)
//
// HTML(ナビゲーション)はネット優先: index.htmlはビルドのたびにハッシュ付きJSファイル名への
// 参照が変わるため、キャッシュ優先にすると「古いindex.htmlが、既に消えた古いJSファイルを
// 参照して読み込みに失敗し白画面になる」事故が起きる(実際に発生した不具合)。
// JS/CSS等のハッシュ付き静的ファイルはファイル名自体が内容を表すので、キャッシュ優先で問題ない。
const CACHE = "kakeibo-v2";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (e.request.mode === "navigate") {
    // HTML: まずネットワークから取得。オフライン時のみキャッシュへフォールバック
    e.respondWith(
      fetch(e.request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // それ以外(ハッシュ付きJS/CSS等): キャッシュ優先、裏で更新
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fetched = fetch(e.request)
        .then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
