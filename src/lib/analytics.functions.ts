import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeJourneyFunnel } from "./journeyFunnel";

type JourneyFunnelClient = {
  from(table: "journey_events"): {
    select(columns: string): PromiseLike<{
      data: { client_id: string; name: string }[] | null;
      error: unknown;
    }>;
  };
};

export async function queryJourneyFunnelCore(client: JourneyFunnelClient) {
  const { data } = await client.from("journey_events").select("client_id, name");
  return computeJourneyFunnel(data ?? []);
}

export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entrySource?: string; entryPath?: string; alertId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("user_daily_active")
      .upsert(
        { user_id: userId, date: today },
        { onConflict: "user_id,date", ignoreDuplicates: true },
      );
    const { data: session, error } = await supabase
      .from("user_sessions")
      .insert({
        user_id: userId,
        entry_source: data.entrySource ?? "direct",
        entry_path: data.entryPath ?? null,
        alert_id: data.alertId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (data.alertId) {
      await supabase.from("alert_events").insert({
        user_id: userId,
        alert_id: data.alertId,
        event: data.entrySource === "push" ? "push_clicked" : "opened",
      });
    }
    return { sessionId: session.id };
  });

export const pingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("user_sessions")
      .update({ last_ping_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return { ok: true };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin" as never,
    });
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
    const last14 = new Date(now.getTime() - 14 * 86400_000).toISOString().slice(0, 10);
    const last21 = new Date(now.getTime() - 21 * 86400_000).toISOString().slice(0, 10);

    const wauQ = await supabase
      .from("user_daily_active")
      .select("user_id", { count: "exact" })
      .gte("date", last7);
    const wauUsers = new Set((wauQ.data ?? []).map((r) => r.user_id));

    // Cohort: signups 14..21 days ago (using profiles.created_at as proxy)
    const cohortQ = await supabase
      .from("profiles")
      .select("user_id, created_at")
      .gte("created_at", `${last21}T00:00:00Z`)
      .lt("created_at", `${last14}T00:00:00Z`);
    const cohort = cohortQ.data ?? [];
    let returned = 0;
    if (cohort.length > 0) {
      const ids = cohort.map((c) => c.user_id);
      const retQ = await supabase
        .from("user_daily_active")
        .select("user_id")
        .in("user_id", ids)
        .gte("date", last7);
      const retSet = new Set((retQ.data ?? []).map((r) => r.user_id));
      returned = retSet.size;
    }

    const eventsQ = await supabase
      .from("alert_events")
      .select("event, alert_kind")
      .gte("created_at", new Date(now.getTime() - 30 * 86400_000).toISOString());
    const engagement: Record<string, Record<string, number>> = {};
    for (const e of eventsQ.data ?? []) {
      const kind = e.alert_kind ?? "unknown";
      engagement[kind] = engagement[kind] ?? {};
      engagement[kind][e.event] = (engagement[kind][e.event] ?? 0) + 1;
    }

    return {
      wau: wauUsers.size,
      cohortSize: cohort.length,
      cohortReturned: returned,
      cohortReturnRate: cohort.length ? returned / cohort.length : 0,
      engagement,
    };
  });

export const getJourneyFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" as never,
    });
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    return queryJourneyFunnelCore(context.supabase as unknown as JourneyFunnelClient);
  });
