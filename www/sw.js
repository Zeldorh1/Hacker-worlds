// Minimal offline cache so the app works on a phone with no signal.
const CACHE = "hw-v3";
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
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
