// Minimal offline cache so the app works on a phone with no signal.
//
// IMPORTANT: install fetches use { cache: "reload" } so the SW pre-cache
// doesn't get poisoned by stale browser HTTP-cache entries during the
// initial pre-fetch. Without this, a user upgrading from an older SW
// can end up with the new SW cache name but the OLD bytes inside it.
const CACHE = "hw-v17";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/main.css",
  "./js/app.js",
  "./js/anticheat.js",
  "./js/audio.js",
  "./js/boot.js",
  "./js/desktop.js",
  "./js/dialog.js",
  "./js/enemies.js",
  "./js/hints.js",
  "./js/library.js",
  "./js/matrix-rain.js",
  "./js/mission-state.js",
  "./js/music.js",
  "./js/scanner.js",
  "./js/sim-memory.js",
  "./js/target-assaultzone.js",
  "./js/timer.js",
  "./js/tutorial.js",
  "./js/missions/index.js",
  "./js/missions/mission-01.js",
  "./js/missions/mission-02.js",
  "./js/missions/mission-03.js",
  "./js/missions/mission-04.js",
  "./js/missions/mission-05.js",
  "./js/missions/mission-06.js",
  "./js/missions/mission-07.js",
  "./js/missions/mission-08.js",
  "./js/missions/mission-09.js",
  "./js/missions/mission-10.js",
  "./js/missions/mission-11.js",
  "./js/missions/mission-12.js",
  "./js/missions/mission-13.js",
  "./js/missions/mission-14.js",
  "./js/missions/mission-15.js",
  "./js/missions/mission-16.js",
  "./js/missions/mission-17.js",
  "./js/missions/mission-18.js",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Force a fresh network fetch for every asset — bypasses the
    // browser HTTP cache so we don't pre-load stale copies.
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res && (res.ok || res.type === "opaque")) await cache.put(url, res);
      } catch {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("message", e => {
  if (!e.data) return;
  if (e.data.type === "skip-waiting") self.skipWaiting();
  if (e.data.type === "purge") {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => e.source && e.source.postMessage({ type: "purged" }));
  }
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match("./index.html")))
  );
});
