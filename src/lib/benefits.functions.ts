// Server functions that mirror the local-first benefit redemption state to
// user_benefit_redemptions. Local storage remains authoritative for the
// current session; server rows exist so redemptions survive across devices.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ServerRedemption = {
  card_catalog_id: string;
  benefit_id: string;
  period_key: string;
  redeemed_cents: number;
  redeemed_at: string;
};

export const listBenefitRedemptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_benefit_redemptions")
      .select("card_catalog_id, benefit_id, period_key, redeemed_cents, redeemed_at")
      .eq("user_id", userId);
    if (error) throw error;
    return { rows: (data ?? []) as ServerRedemption[] };
  });

export const upsertBenefitRedemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      card_catalog_id: string;
      benefit_id: string;
      period_key: string;
      redeemed_cents: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_benefit_redemptions").upsert(
      {
        user_id: userId,
        card_catalog_id: data.card_catalog_id,
        benefit_id: data.benefit_id,
        period_key: data.period_key,
        redeemed_cents: Math.max(0, Math.round(data.redeemed_cents)),
        redeemed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,card_catalog_id,benefit_id,period_key" },
    );
    if (error) throw error;
    return { ok: true };
  });
