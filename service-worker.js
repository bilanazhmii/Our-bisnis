const CACHE="kopi-tutug-v3";
const ASSETS=["./","./index.html","./style.css","./script.js","./manifest.json","./icon.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  // Do not cache API requests - always fetch fresh from server
  if(e.request.url.includes('/api/')) return;
  // Network-first for HTML to get latest version
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{
      const clone=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,clone));
      return r;
    }).catch(()=>caches.match(e.request)));
    return;
  }
  // Cache-first for static assets
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});