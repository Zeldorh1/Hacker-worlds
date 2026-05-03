// Minimal offline cache so the app works on a phone with no signal.
//
// IMPORTANT: install fetches use { cache: "reload" } so the SW pre-cache
// doesn't get poisoned by stale browser HTTP-cache entries during the
// initial pre-fetch. Without this, a user upgrading from an older SW
// can end up with the new SW cache name but the OLD bytes inside it.
const CACHE = "hw-v64";
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
  "./js/struct-view.js",
  "./js/matrix-rain.js",
  "./js/mission-state.js",
  "./js/music.js",
  "./js/scanner.js",
  "./js/sim-memory.js",
  "./js/dll.js",
  "./js/cpp-export.js",
  "./js/code-segment.js",
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
  "./js/missions/mission-19.js",
  "./js/missions/mission-20.js",
  "./js/missions/mission-21.js",
  "./js/missions/mission-22.js",
  "./js/missions/mission-23.js",
  "./js/missions/mission-24.js",
  "./js/missions/mission-25.js",
  "./js/missions/mission-26.js",
  "./js/missions/mission-27.js",
  "./js/missions/mission-28.js",
  "./js/missions/mission-29.js",
  "./js/missions/mission-30.js",
  "./js/missions/mission-31.js",
  "./js/missions/mission-32.js",
  "./js/missions/mission-33.js",
  "./js/missions/mission-34.js",
  "./js/missions/mission-35.js",
  "./js/missions/mission-36.js",
  "./js/missions/mission-37.js",
  "./js/missions/mission-38.js",
  "./js/missions/mission-39.js",
  "./js/missions/mission-40.js",
  "./js/missions/mission-41.js",
  "./js/missions/mission-42.js",
  "./js/missions/mission-43.js",
  "./js/missions/mission-44.js",
  "./js/missions/mission-45.js",
  "./js/missions/mission-46.js",
  "./js/missions/mission-47.js",
  "./js/missions/mission-48.js",
  "./js/missions/mission-49.js",
  "./js/missions/mission-50.js",
  "./js/missions/mission-51.js",
  "./js/missions/mission-52.js",
  "./js/missions/mission-53.js",
  "./js/missions/mission-54.js",
  "./js/missions/mission-55.js",
  "./js/missions/mission-56.js",
  "./js/missions/mission-58.js",
  "./js/missions/mission-59.js",
  "./js/missions/mission-64.js",
  "./js/missions/mission-65.js",
  "./js/missions/mission-66.js",
  "./js/missions/mission-70.js",
  "./js/missions/mission-71.js",
  "./js/missions/mission-72.js",
  "./js/missions/mission-73.js",
  "./js/missions/mission-74.js",
  "./js/missions/mission-75.js",
  "./js/missions/mission-76.js",
  "./js/missions/mission-77.js",
  "./js/missions/mission-78.js",
  "./js/missions/mission-79.js",
  "./js/missions/mission-60.js",
  "./js/missions/mission-61.js",
  "./js/missions/mission-62.js",
  "./js/missions/mission-63.js",
  "./js/missions/mission-67.js",
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
