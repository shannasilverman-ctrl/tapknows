import { useEffect, useState } from "react";

/** Tracks navigator.onLine with a React-friendly hook. */
export function useOnline(): boolean {
  // Keep the server and first client render identical, then reconcile with
  // the browser. Reading navigator in the initializer causes hydration drift
  // in installed PWAs and privacy-focused browsers.
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
