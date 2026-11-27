/* AD Music Service Worker v2.0.0 */
const APP_VERSION = "2.0.0";
const SHELL_CACHE = `ad-music-shell-v${APP_VERSION}`;
const OFFLINE_AUDIO_CACHE = "ad-music-offline-audio-v1";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== OFFLINE_AUDIO_CACHE) {
            return caches.delete(key);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data.type === "FORCE_UPDATE") {
    event.waitUntil(
      caches.keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k !== OFFLINE_AUDIO_CACHE)
              .map((k) => caches.delete(k))
          )
        )
        .then(() => self.skipWaiting())
        .then(() =>
          self.clients.matchAll({ type: "window" }).then((clients) => {
            clients.forEach((client) => client.postMessage({ type: "UPDATE_READY" }));
          })
        )
    );
  }

  if (event.data.type === "CLEAR_AUDIO_CACHE") {
    event.waitUntil(caches.delete(OFFLINE_AUDIO_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept Google Apps Script API calls or range audio streams unless cached offline
  if (url.hostname.includes("script.google.com") || url.hostname.includes("script.googleusercontent.com")) {
    return;
  }

  // Check offline audio cache first for exact audio URLs if saved offline
  if (req.headers.get("range")) {
    return;
  }

  const isShellAsset =
    url.origin === self.location.origin &&
    (url.pathname.endsWith("/") ||
      url.pathname.endsWith("index.html") ||
      url.pathname.endsWith("style.css") ||
      url.pathname.endsWith("app.js") ||
      url.pathname.endsWith("manifest.json"));

  if (isShellAsset) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Fallback to offline audio cache when offline
  event.respondWith(
    caches.open(OFFLINE_AUDIO_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req);
      })
    )
  );
});