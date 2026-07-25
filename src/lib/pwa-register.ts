// Service worker registration wrapper. Disabled in embedded and dev contexts.
// Registers the combined offline + push SW at /sw.js.

const SW_PATH = "/sw.js";
const OLD_PATHS = ["/push-sw.js"];

function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  if (!("serviceWorker" in navigator)) return true;
  if (window.self !== window.top) return true;
  if (
    new URL(window.location.href).searchParams.has("sw") &&
    new URL(window.location.href).searchParams.get("sw") === "off"
  ) {
    return true;
  }
  return !import.meta.env.PROD;
}

async function unregisterMatching(paths: string[]) {
  try {
    for (const p of paths) {
      const reg = await navigator.serviceWorker.getRegistration(p);
      if (reg) await reg.unregister();
    }
  } catch {
    // no-op
  }
}

export async function registerAppServiceWorker(): Promise<void> {
  if (shouldSkip()) {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      await unregisterMatching([SW_PATH, ...OLD_PATHS]);
    }
    return;
  }
  try {
    // Retire old push-only worker; the combined SW handles push now.
    await unregisterMatching(OLD_PATHS);
    await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch {
    // Silent — offline is a progressive enhancement.
  }
}
