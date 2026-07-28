export const MODULE_RECOVERY_STORAGE_KEY = "tap_module_recovery_v1";
export const MODULE_RECOVERY_QUERY_KEY = "_tap_retry";

/**
 * This runs before the application module. If Cloudflare or the network drops
 * a module request, SSR can leave a convincing but inert checkout screen.
 * Reload once with a cache-busting document URL, then stop for 60 seconds so a
 * persistent outage never becomes a reload loop.
 */
export const MODULE_RECOVERY_SCRIPT = `(() => {
  const storageKey = ${JSON.stringify(MODULE_RECOVERY_STORAGE_KEY)};
  const queryKey = ${JSON.stringify(MODULE_RECOVERY_QUERY_KEY)};
  const retryWindowMs = 60000;

  const recover = () => {
    const now = Date.now();
    const next = new URL(location.href);
    if (next.searchParams.has(queryKey)) return;

    try {
      const previous = Number(sessionStorage.getItem(storageKey) || "0");
      if (previous && now - previous < retryWindowMs) return;
      sessionStorage.setItem(storageKey, String(now));
    } catch {}

    next.searchParams.set(queryKey, now.toString(36));
    location.replace(next.toString());
  };

  addEventListener("error", (event) => {
    const target = event.target;
    if (target && target.tagName === "SCRIPT" && target.type === "module") recover();
  }, true);

  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = String(reason && reason.message ? reason.message : reason || "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)) {
      recover();
    }
  });

  setTimeout(() => {
    if (document.documentElement.dataset.tapHydrated !== "true") recover();
  }, 8000);
})();`;
