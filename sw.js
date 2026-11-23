// Offline cache for the MOP Generator. Bump VERSION on every release so users get the new files.
const VERSION = "mop-gen-v2.5.0";
const FILES = ["./", "index.html", "auto.html", "css/style.css", "js/core.js", "js/app.js", "js/auto-parse.js", "vendor/exceljs.min.js", "vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js", "vendor/qrcode.js", "js/auto-import.js", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // network first, fall back to cache when offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
