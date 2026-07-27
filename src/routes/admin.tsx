import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getAdminStats, getJourneyFunnel } from "@/lib/analytics.functions";
import { BottomNav } from "@/components/bottom-nav";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Stats = Awaited<ReturnType<typeof getAdminStats>>;
type Funnel = Awaited<ReturnType<typeof getJourneyFunnel>>;

/** Human labels for the five canonical decision-funnel steps. */
const FUNNEL_STEP_LABELS: Record<string, string> = {
  wallet_ready: "Wallet ready",
  merchant_selected: "Merchant selected",
  recommendation_viewed: "Recommendation viewed",
  proof_opened: "Proof opened",
  payment_choice_recorded: "Payment choice recorded",
};

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchStats = useServerFn(getAdminStats);
  const fetchFunnel = useServerFn(getJourneyFunnel);
  const [stats, setStats] = useState<Stats | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const denied = (e: unknown) => {
      const message = String((e as { message?: unknown })?.message ?? e);
      if (message.includes("403") || String(e).includes("Forbidden")) {
        setForbidden(true);
      }
    };
    fetchStats({}).then(setStats).catch(denied);
    // The decision funnel reads back through the same admin gate.
    fetchFunnel({}).then(setFunnel).catch(denied);
  }, [user, loading, navigate, fetchStats, fetchFunnel]);

  if (loading || !user) return <div className="min-h-screen bg-background" />;
  if (forbidden) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <p className="text-sm font-medium text-foreground">Admin only</p>
        <p className="mt-1 text-xs text-muted-foreground">You don't have access to this view.</p>
        <Link to="/plan" className="mt-4 text-xs underline text-foreground">
          Back to app
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4">
        <h1 className="text-base font-semibold text-foreground">Admin</h1>
        <p className="text-xs text-muted-foreground mt-1">Internal usage and retention.</p>
      </header>
      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8 space-y-4">
        {!stats ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <StatCard label="Weekly active users (7d)" value={String(stats.wau)} />
            <StatCard
              label="Week-2 return rate"
              value={
                stats.cohortSize === 0
                  ? "—"
                  : `${Math.round(stats.cohortReturnRate * 100)}% (${stats.cohortReturned}/${stats.cohortSize})`
              }
              sub="Signups from 14–21 days ago who returned in the last 7."
            />
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Alert engagement (30d)
              </p>
              {Object.keys(stats.engagement).length === 0 ? (
                <p className="text-xs text-muted-foreground">No events yet.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {Object.entries(stats.engagement).map(([kind, events]) => (
                    <li key={kind} className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{kind}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {Object.entries(events)
                          .map(([e, c]) => `${e}:${c}`)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Decision funnel
          </p>
          {!funnel ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {funnel.map((row) => (
                <li key={row.step} className="flex items-center justify-between">
                  <span className="font-medium text-foreground">
                    {FUNNEL_STEP_LABELS[row.step] ?? row.step}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.count}
                    {row.dropOff === null ? "" : ` · ${Math.round(row.dropOff * 100)}% drop-off`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Distinct clients per step; drop-off is measured against the previous step.
          </p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
