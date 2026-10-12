// Network-first for this site's own files, so a new deploy shows up on the next load;
// the cached copy is only used when the network is unavailable.
// Supabase and Google Fonts requests are cross-origin and pass through untouched.
const CACHE = "cashsplit-v1";
const SHELL = [
  "/", "/index.html", "/styles.css", "/config.js", "/store.js", "/split.js", "/app.js",
  "/vendor/supabase.js", "/manifest.webmanifest", "/icons/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === "navigate" ? caches.match("/index.html") : Response.error())))
  );
});
