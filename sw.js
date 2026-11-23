/* Immaculate Home Solutions — service worker.
 * Cache-first for the app shell so the book opens fast and offline;
 * network always wins for Supabase (data + auth) — never cached. */
var CACHE = "ihs-shell-v1";
var SHELL = ["./", "index.html", "style.css", "config.js", "seed-data.js",
             "data.js", "app.js", "manifest.json", "icon.svg",
             "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (url.hostname.indexOf("supabase.co") >= 0 || e.request.method !== "GET") return; // network only
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res.ok && url.origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
