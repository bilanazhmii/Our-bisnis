const CACHE = "el-matcha-kopi-v8";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon.png"
];

function shouldBypassCache(url) {
  return (
    url.includes("/api/") ||
    url.includes("supabase.co") ||
    url.includes("vercel.com/sso-api") ||
    url.endsWith(".js")
  );
}

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function(cache) { return cache.addAll(STATIC_ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(key) { return key !== CACHE; })
            .map(function(key) { return caches.delete(key); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event) {
  var request = event.request;
  var url = request.url;

  if (shouldBypassCache(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE).then(function(cache) {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(function() { return caches.match(request); })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function(cached) {
      return cached || fetch(request);
    })
  );
});
