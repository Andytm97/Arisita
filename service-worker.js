const CACHE_NAME = "aris-v1-20260804-direct-cover-v2";
const CORE = [
  "./", "./index.html", "./style.css", "./manifest.webmanifest",
  "./src/app.js", "./src/core/utils.js", "./src/core/content-model.js",
  "./src/components/memory-renderer.js", "./src/data/demo-data.js",
  "./data/contenido.json", "./assets/fondo.jpg", "./assets/favicon.svg",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
  "./assets/media/nota-demo.m4a", "./assets/media/video-demo.mp4",
  "./admin/", "./admin/index.html", "./admin/admin.css", "./admin/admin.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});
