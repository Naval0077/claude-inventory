// Keeps the app's own files on the device so it opens instantly and survives short connection drops.
// Data always comes live from Supabase; this never caches it.
const VERSION = "stock-v2";
const SHELL = ["./", "index.html", "styles.css", "config.js", "db.js", "camera.js", "app.js", "boot.js", "manifest.webmanifest", "icons/icon.svg",
  "vendor/supabase.js", "vendor/zxing-wasm-reader.js", "vendor/zxing_reader.wasm"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin files: serve from cache, refresh in the background, so updates arrive on the next open.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    e.waitUntil(fresh.catch(() => {})); // keep refreshing the cache even though we may answer from `hit` below
    return hit || fresh;
  }));
});
