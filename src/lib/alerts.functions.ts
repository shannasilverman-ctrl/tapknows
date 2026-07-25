import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rotatingBonuses } from "./rotating-categories";

function currentQuarterKey(d = new Date()): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}
function quarterStart(d = new Date()): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400_000);
}

type AlertRow = {
  user_id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  action_label: string | null;
  deep_link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string;
};

/** Idempotent: derive alerts for the calling user, upsert by dedupe_key. */
export const generateAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = new Date();
    const rows: AlertRow[] = [];

    const [uc, uo, usb, ucs] = await Promise.all([
      supabase.from("user_cards").select("id, card_catalog_id, nickname"),
      supabase.from("user_offers").select("*"),
      supabase.from("user_signup_bonuses").select("*"),
      supabase.from("user_category_spend").select("*"),
    ]);

    const userCards = uc.data ?? [];
    const cardById = new Map(userCards.map((c) => [c.id, c]));
    const ownedCatalog = new Set(userCards.map((c) => c.card_catalog_id));

    // (a) Rotating category activation — first 14 days of each quarter
    const qStart = quarterStart(now);
    const qKey = currentQuarterKey(now);
    const daysIntoQuarter = daysBetween(now, qStart);
    if (daysIntoQuarter >= 0 && daysIntoQuarter <= 14) {
      for (const rb of rotatingBonuses()) {
        if (!ownedCatalog.has(rb.card_catalog_id)) continue;
        const card = userCards.find((c) => c.card_catalog_id === rb.card_catalog_id)!;
        rows.push({
          user_id: userId,
          kind: "rotating_activate",
          severity: "action",
          title: `${rb.cardLabel}: activate this quarter's 5%`,
          body: rb.detail,
          action_label: "Activate on issuer site",
          deep_link: `/cards`,
          entity_type: "user_card",
          entity_id: card.id,
          dedupe_key: `rotating_${rb.card_catalog_id}_${qKey}`,
        });
      }
    }

    // (b) Offer expiring — T-7 and T-1
    for (const o of uo.data ?? []) {
      if (!o.expires_at) continue;
      const exp = new Date(o.expires_at + "T23:59:59Z");
      const days = daysBetween(exp, now);
      const bucket = days <= 1 ? "d1" : days <= 7 ? "d7" : null;
      if (!bucket) continue;
      const card = cardById.get(o.user_card_id);
      rows.push({
        user_id: userId,
        kind: "offer_expiring",
        severity: days <= 1 ? "urgent" : "warn",
        title:
          days <= 0
            ? `${o.merchant_text} offer expires today`
            : `${o.merchant_text} offer expires in ${days} day${days === 1 ? "" : "s"}`,
        body: card?.nickname ? `Saved to ${card.nickname}.` : "Use it before it disappears.",
        action_label: "See the play",
        deep_link: `/offers`,
        entity_type: "user_offer",
        entity_id: o.id,
        dedupe_key: `offer_${o.id}_${bucket}`,
      });
    }

    // (c) Cap approaching — 80% and 100%
    for (const s of ucs.data ?? []) {
      if (s.cap_cents <= 0) continue;
      const pct = (s.spend_cents / s.cap_cents) * 100;
      const bucket = pct >= 100 ? "p100" : pct >= 80 ? "p80" : null;
      if (!bucket) continue;
      const card = cardById.get(s.user_card_id);
      rows.push({
        user_id: userId,
        kind: "cap_approaching",
        severity: bucket === "p100" ? "urgent" : "warn",
        title:
          bucket === "p100"
            ? `${s.category_key} cap reached on ${card?.nickname ?? "your card"}`
            : `${Math.round(pct)}% of ${s.category_key} cap used`,
        body: `${s.quarter}. Switch cards to keep earning above 1x.`,
        action_label: "Plan a purchase",
        deep_link: `/plan`,
        entity_type: "user_category_spend",
        entity_id: s.id,
        dedupe_key: `cap_${s.id}_${bucket}`,
      });
    }

    // (d) SUB progress — 50%, 80%, and 14-day deadline
    for (const b of usb.data ?? []) {
      if (b.spend_required <= 0) continue;
      const pct = (b.spend_so_far / b.spend_required) * 100;
      const sent = (b.alerts_sent as Record<string, boolean> | null) ?? {};
      const buckets: Array<{ key: "p50" | "p80"; title: string; sev: string }> = [];
      if (pct >= 80 && !sent.p80)
        buckets.push({ key: "p80", title: "80% to the welcome bonus", sev: "action" });
      else if (pct >= 50 && !sent.p50)
        buckets.push({ key: "p50", title: "Halfway to the welcome bonus", sev: "info" });
      const card = cardById.get(b.user_card_id);
      for (const bk of buckets) {
        rows.push({
          user_id: userId,
          kind: "sub_progress",
          severity: bk.sev,
          title: bk.title,
          body: card?.nickname
            ? `${card.nickname}: ${Math.round(pct)}% of $${(b.spend_required / 100).toLocaleString()} spent.`
            : `${Math.round(pct)}% of $${(b.spend_required / 100).toLocaleString()} spent.`,
          action_label: "Update spend",
          deep_link: `/bonuses`,
          entity_type: "user_signup_bonus",
          entity_id: b.id,
          dedupe_key: `sub_${b.id}_${bk.key}`,
        });
      }
      if (b.deadline) {
        const dl = new Date(b.deadline + "T23:59:59Z");
        const daysLeft = daysBetween(dl, now);
        if (daysLeft > 0 && daysLeft <= 14 && !sent.d14) {
          rows.push({
            user_id: userId,
            kind: "sub_deadline",
            severity: daysLeft <= 3 ? "urgent" : "warn",
            title: `${daysLeft} days left to hit the welcome bonus`,
            body: card?.nickname
              ? `${card.nickname}: $${((b.spend_required - b.spend_so_far) / 100).toLocaleString()} to go.`
              : `$${((b.spend_required - b.spend_so_far) / 100).toLocaleString()} to go.`,
            action_label: "Update spend",
            deep_link: `/bonuses`,
            entity_type: "user_signup_bonus",
            entity_id: b.id,
            dedupe_key: `sub_${b.id}_d14`,
          });
        }
      }
    }

    if (rows.length === 0) return { generated: 0 };

    // Upsert by (user_id, dedupe_key)
    const { error } = await supabase
      .from("alerts")
      .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    if (error) throw error;
    return { generated: rows.length };
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("alerts")
      .select("*")
      .is("dismissed_at", null)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const markAlertOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: row } = await context.supabase
      .from("alerts")
      .select("kind")
      .eq("id", data.id)
      .single();
    await context.supabase
      .from("alerts")
      .update({ opened_at: now, read_at: now })
      .eq("id", data.id);
    await context.supabase.from("alert_events").insert({
      user_id: context.userId,
      alert_id: data.id,
      alert_kind: row?.kind ?? null,
      event: "opened",
    });
    return { ok: true };
  });

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("alerts")
      .select("kind")
      .eq("id", data.id)
      .single();
    await context.supabase
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id);
    await context.supabase.from("alert_events").insert({
      user_id: context.userId,
      alert_id: data.id,
      alert_kind: row?.kind ?? null,
      event: "dismissed",
    });
    return { ok: true };
  });

export const markAllAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    return { ok: true };
  });

export const getUnreadAlertCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .is("read_at", null)
      .is("dismissed_at", null);
    return { count: count ?? 0 };
  });
