// Kill-switch: this path has moved to /sw.js. Unregister on next visit.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.clients.claim();
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});
