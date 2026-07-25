// Server-only helpers for tearing down Plaid data for a user or a single item.
// Never import from client code — the .server.ts extension blocks it.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Purge every trace of a linked Plaid item: call /item/remove on Plaid's side
 * (best-effort), delete the private access token, the item row, and the
 * derived per-item data. Wallet cards (user_cards) are the user's cards, not
 * Plaid's, so we detach them (null out plaid_item_id/plaid_account_id) unless
 * `deleteCards` is set.
 *
 * Optionally clears merchant-frequency aggregates. Anonymous per-merchant
 * category memory is preserved unless `clearMemory` is set.
 */
export async function purgePlaidItem(
  supabaseAdmin: SupabaseClient,
  opts: {
    userId: string;
    plaidItemId: string;
    clearMemory?: boolean;
    deleteCards?: boolean;
  },
) {
  const { plaidPost } = await import("@/lib/plaid.server");

  const { data: itemRow } = await supabaseAdmin
    .from("user_plaid_items")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("plaid_item_id", opts.plaidItemId)
    .maybeSingle();
  if (!itemRow) return { ok: false as const, reason: "not_found" };

  const { data: priv } = await supabaseAdmin
    .from("user_plaid_items_private")
    .select("access_token")
    .eq("plaid_item_pk", itemRow.id)
    .maybeSingle();

  if (priv?.access_token) {
    try {
      await plaidPost("/item/remove", { access_token: priv.access_token });
    } catch (e) {
      // Best-effort — Plaid may reject if the item was already revoked.
      console.error("[plaid] item/remove", e);
    }
  }

  // Delete private token first, then the item row, then per-item derived data.
  await supabaseAdmin.from("user_plaid_items_private").delete().eq("plaid_item_pk", itemRow.id);
  await supabaseAdmin.from("user_plaid_items").delete().eq("id", itemRow.id);

  if (opts.deleteCards) {
    await supabaseAdmin
      .from("user_cards")
      .delete()
      .eq("user_id", opts.userId)
      .eq("plaid_item_id", opts.plaidItemId);
  } else {
    // Detach: cards remain, no longer tied to the item.
    await supabaseAdmin
      .from("user_cards")
      .update({ plaid_item_id: null, plaid_account_id: null })
      .eq("user_id", opts.userId)
      .eq("plaid_item_id", opts.plaidItemId);
  }

  // Clear any outstanding item-scoped alerts (reconnect / new-accounts).
  await supabaseAdmin
    .from("alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", opts.userId)
    .in("dedupe_key", [
      `plaid_reconnect:${opts.plaidItemId}`,
      `plaid_new_accounts:${opts.plaidItemId}`,
    ])
    .is("dismissed_at", null);

  if (opts.clearMemory) {
    // Wipe derived aggregates + anonymous merchant category memory.
    await supabaseAdmin
      .from("user_prefs")
      .update({ plaid_top_merchants: null, plaid_last_sync_at: null })
      .eq("user_id", opts.userId);
  }

  return { ok: true as const };
}

/**
 * Full account offboarding: purge every linked Plaid item, then delete the
 * auth user (all public.user_* rows cascade). Returns the count of items
 * removed so the caller can surface it if useful.
 */
export async function purgeAllUserData(supabaseAdmin: SupabaseClient, userId: string) {
  const { data: items } = await supabaseAdmin
    .from("user_plaid_items")
    .select("plaid_item_id")
    .eq("user_id", userId);
  for (const it of items ?? []) {
    await purgePlaidItem(supabaseAdmin, {
      userId,
      plaidItemId: it.plaid_item_id,
      clearMemory: true,
      deleteCards: true,
    });
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw error;
  return { items_removed: items?.length ?? 0 };
}
