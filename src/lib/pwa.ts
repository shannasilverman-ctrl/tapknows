// Environment detection for iOS PWA push education.
// Web Push on iOS requires the app to be installed to the Home Screen.

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as unknown as { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS reports as Mac with touch, so also check touch points.
  const iPadOS =
    /Macintosh/.test(ua) &&
    (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

/** True when we should show the Add-to-Home-Screen instruction instead of an
 *  enable button (iOS browser, not yet installed). */
export function needsHomeScreenInstall(): boolean {
  return isIOS() && !isStandalone();
}
