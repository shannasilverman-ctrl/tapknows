import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BottomNav } from "@/components/bottom-nav";
import {
  generateAlerts,
  listAlerts,
  markAlertOpened,
  dismissAlert,
  markAllAlertsRead,
} from "@/lib/alerts.functions";
import { Bell, Check, X, WifiOff } from "lucide-react";
import { PushPrimer } from "@/components/push-primer";
import { useOnline } from "@/hooks/use-online";
import { OfflinePill } from "@/components/offline-pill";

export const Route = createFileRoute("/alerts")({
  component: AlertsPage,
});

type Alert = Awaited<ReturnType<typeof listAlerts>>[number];

function AlertsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const gen = useServerFn(generateAlerts);
  const list = useServerFn(listAlerts);
  const open = useServerFn(markAlertOpened);
  const dismiss = useServerFn(dismissAlert);
  const readAll = useServerFn(markAllAlertsRead);

  const [alerts, setAlerts] = useState<Alert[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const refresh = async () => {
    const rows = await list({});
    setAlerts(rows);
  };

  useEffect(() => {
    if (!user) return;
    if (!online) {
      setAlerts([]);
      return;
    }
    (async () => {
      try {
        await gen({});
      } catch {}
      await refresh();
      readAll({}).catch(() => {});
    })();
  }, [user, online]);

  const handleOpen = async (a: Alert) => {
    await open({ data: { id: a.id } }).catch(() => {});
    if (a.deep_link) navigate({ to: a.deep_link as never });
  };

  const handleDismiss = async (a: Alert) => {
    setAlerts((rs) => rs?.filter((r) => r.id !== a.id) ?? null);
    await dismiss({ data: { id: a.id } }).catch(() => {});
  };

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  return (
    <div className="cs-app-body tap-consumer-screen min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-foreground">Alerts</h1>
          <OfflinePill />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          What's expiring, activating, or worth switching cards for.
        </p>
        {!online && (
          <div className="mt-4 rounded-2xl border border-border bg-secondary/40 px-4 py-3 flex items-start gap-3">
            <WifiOff className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              You're offline. Alerts will sync when you're back on the network.
            </p>
          </div>
        )}
      </header>

      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8">
        {alerts && alerts.length > 0 && <PushPrimer />}
        {!alerts ? null : alerts.length === 0 ? (
          <div className="mt-2">
            <div
              aria-hidden
              className="cs-pass relative rounded-2xl border border-dashed border-border-strong bg-white/60 px-4 py-5 opacity-70"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-secondary/70 flex items-center justify-center">
                  <Bell className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-3 w-24 rounded bg-secondary/70" />
                  <div className="mt-2 h-3 w-40 rounded bg-secondary/50" />
                </div>
              </div>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground text-center">
              Deadlines and expiring offers will land here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {labelForKind(a.kind)}
                      </span>
                      {a.severity === "urgent" && (
                        <span className="text-[10px] uppercase tracking-wider text-destructive font-medium">
                          Urgent
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-0.5">{a.title}</p>
                    {a.body && <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>}
                    {a.action_label && (
                      <button
                        onClick={() => handleOpen(a)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
                      >
                        {a.action_label}
                        <Check className="size-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleDismiss(a)}
                    className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function labelForKind(k: string): string {
  switch (k) {
    case "rotating_activate":
      return "Rotating 5%";
    case "offer_expiring":
      return "Offer";
    case "cap_approaching":
      return "Cap";
    case "sub_progress":
      return "Welcome bonus";
    case "sub_deadline":
      return "Deadline";
    default:
      return k;
  }
}
