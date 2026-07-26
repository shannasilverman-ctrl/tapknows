// TAP service worker: offline app-shell + push notifications.
// Runtime NetworkFirst for navigations, CacheFirst for hashed assets.
// Client-side recommendation engine works offline once the shell is cached.

const CACHE_VERSION = "tap-v4-motion";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// Warm caches with a minimal set on install — the rest fills on first visit.
const CORE_URLS = ["/", "/home", "/decide", "/onboarding", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(CORE_URLS.map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.allSettled(
        names.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|mjs|css|woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept auth callbacks or API/server-fn paths.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn/") ||
    url.pathname.startsWith("/~oauth")
  ) {
    return;
  }

  // HTML navigations: NetworkFirst, fall back to cached shell.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached =
            (await cache.match(req)) || (await cache.match("/home")) || (await cache.match("/"));
          if (cached) return cached;
          return new Response("<h1>Offline</h1>", {
            headers: { "content-type": "text/html" },
            status: 503,
          });
        }
      })(),
    );
    return;
  }

  // Static assets: CacheFirst.
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          if (cached) return cached;
          return new Response("", { status: 504 });
        }
      })(),
    );
  }
});

// ---------------- Push notifications ----------------
self.addEventListener("push", (event) => {
  let payload = { title: "TAP", body: "", url: "/alerts", tag: "tap" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/alerts";
  const target = new URL(url, self.location.origin);
  target.searchParams.set("src", "push");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate(target.toString());
          return c.focus();
        }
      }
      return self.clients.openWindow(target.toString());
    }),
  );
});
