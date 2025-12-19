// The values of these constants are replaced by the buildscript.
// Do not change the values as that might break the replacing.
// Look in /build/tasts/serviceworker.go to see implementation
const CACHE_NAME = "cache_name_placeholder";
const FILES_TO_CACHE = ["assets_to_cache_placeholder"];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
});

self.addEventListener("fetch", (event) => {
  // Skip service worker for dev endpoints (like SSE live reload)
  if (event.request.url.includes('/dev/')) {
    return;
  }

  const normalizedUrl = normalizeUrl(event.request.url);

  event.respondWith(
    caches.match(normalizedUrl).then((response) => {
      return response || fetch(event.request);
    }),
  );
});

function normalizeUrl(url) {
  const urlObj = new URL(url);

  if (urlObj.search) {
    urlObj.search = "";
  }

  return urlObj.toString();
}
