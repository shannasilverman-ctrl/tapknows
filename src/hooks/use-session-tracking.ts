import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startSession, pingSession } from "@/lib/analytics.functions";
import { useAuth } from "@/hooks/use-auth";

// Attribution: read ?src= and ?alertId= from the initial URL once per session.
function readAttribution(): { entrySource: string; alertId: string | null; entryPath: string } {
  if (typeof window === "undefined")
    return { entrySource: "direct", alertId: null, entryPath: "/" };
  const url = new URL(window.location.href);
  const src = url.searchParams.get("src") ?? "direct";
  const alertId = url.searchParams.get("alertId");
  return { entrySource: src, alertId, entryPath: url.pathname };
}

/** Mount once at the root, after AuthProvider. Tracks session + pings every 60s. */
export function useSessionTracking(): void {
  const { user, loading } = useAuth();
  const startFn = useServerFn(startSession);
  const pingFn = useServerFn(pingSession);
  const sessionIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || startedRef.current) return;
    startedRef.current = true;
    const attr = readAttribution();
    (async () => {
      try {
        const res = await startFn({ data: attr });
        sessionIdRef.current = res.sessionId;
      } catch {
        // silent
      }
    })();
  }, [user, loading, startFn]);

  useEffect(() => {
    const interval = setInterval(() => {
      const id = sessionIdRef.current;
      if (!id || document.visibilityState !== "visible") return;
      pingFn({ data: { sessionId: id } }).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [pingFn]);
}
