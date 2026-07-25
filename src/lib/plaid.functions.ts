// Plaid server functions. All calls are same-origin RPC; the client never sees
// PLAID secrets or the access_token. Sandbox environment only.
//
// IMPORTANT: TanStack's server-function code splitter isolates each
// `.handler()` body and can strip sibling runtime declarations in the same
// module (helpers, top-level zod schemas, constants) — when it does, the
// whole file's handlers can drop out of the worker's server-fn manifest and
// requests come back as
//   "Server function info not found for src"
// with a 500. To stay safe, this file contains ONLY server-fn declarations.
// Every zod schema is defined inside its handler, and every shared helper
// lives in `plaid.server.ts` and is dynamically imported inside the handler.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- shared types (types are erased, safe at module scope) ----------

type PlaidAccount = {
  account_id: string;
  mask: string | null;
  name: string;
  official_name: string | null;
  subtype: string | null;
  type: string;
};

export type PlaidCandidate = {
  account_id: string;
  mask: string | null;
  account_name: string;
  official_name: string | null;
  institution_name: string | null;
  suggested_catalog_id: string | null;
  suggested_confidence: number; // 0..1
};

// ---------- link_token/create ----------

export const createPlaidLinkToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { plaidPost, plaidEnv, plaidWebhookUrl, PLAID_ITEM_CAP, PLAID_CAP_ERROR } =
      await import("@/lib/plaid.server");

    // Capacity guard — production limited mode allows a fixed number of Items
    // per account. Count only rows that still have credentials (an unlink or
    // revoke deletes the private row and frees a slot).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_plaid_items")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= PLAID_ITEM_CAP) {
      // Tagged error surfaced to the client so PlaidLinkButton can render the
      // calm "at capacity" sheet rather than a raw Plaid failure.
      console.warn("[plaid] cap reached", { count, cap: PLAID_ITEM_CAP });
      throw new Error(PLAID_CAP_ERROR);
    }

    const res = await plaidPost<{ link_token: string; expiration: string }>("/link/token/create", {
      user: { client_user_id: context.userId },
      client_name: "TAP",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      webhook: plaidWebhookUrl(),
    });
    return { link_token: res.link_token, env: plaidEnv() };
  });

// ---------- exchange + list accounts (candidate match) ----------

export const exchangePublicToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z
      .object({
        public_token: z.string().min(10),
        institution_name: z.string().nullable().optional(),
        institution_id: z.string().nullable().optional(),
      })
      .parse(d);
  })
  .handler(async ({ data, context }) => {
    const { plaidPost, matchAccountToCatalog } = await import("@/lib/plaid.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ex = await plaidPost<{ access_token: string; item_id: string }>(
      "/item/public_token/exchange",
      { public_token: data.public_token },
    );

    const { data: itemRow, error: itemErr } = await supabaseAdmin
      .from("user_plaid_items")
      .insert({
        user_id: context.userId,
        plaid_item_id: ex.item_id,
        institution_name: data.institution_name ?? null,
        status: "active",
      })
      .select("id")
      .single();
    if (itemErr) throw itemErr;

    await supabaseAdmin.from("user_plaid_items_private").insert({
      plaid_item_pk: itemRow.id,
      access_token: ex.access_token,
    });

    const acctRes = await plaidPost<{ accounts: PlaidAccount[] }>("/accounts/get", {
      access_token: ex.access_token,
    });

    const credit = acctRes.accounts.filter(
      (a) => a.type === "credit" || a.subtype === "credit card",
    );

    const candidates: PlaidCandidate[] = credit.map((a) => {
      const match = matchAccountToCatalog(data.institution_name ?? "", a.official_name ?? a.name);
      return {
        account_id: a.account_id,
        mask: a.mask,
        account_name: a.name,
        official_name: a.official_name,
        institution_name: data.institution_name ?? null,
        suggested_catalog_id: match?.id ?? null,
        suggested_confidence: match?.score ?? 0,
      };
    });

    return { item_id: ex.item_id, candidates };
  });

// ---------- confirm matches → wallet ----------

export const confirmPlaidMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z
      .object({
        item_id: z.string().min(1),
        matches: z
          .array(
            z.object({
              account_id: z.string(),
              catalog_id: z.string(),
              mask: z.string().nullable().optional(),
            }),
          )
          .min(1),
      })
      .parse(d);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let added = 0;
    for (const m of data.matches) {
      const { data: existing } = await supabase
        .from("user_cards")
        .select("id")
        .eq("user_id", userId)
        .eq("plaid_account_id", m.account_id)
        .maybeSingle();
      if (existing) continue;
      const { error } = await supabase.from("user_cards").insert({
        user_id: userId,
        card_catalog_id: m.catalog_id,
        plaid_account_id: m.account_id,
        plaid_item_id: data.item_id,
        mask: m.mask ?? null,
      });
      if (!error) added++;
    }
    return { added };
  });

// ---------- disconnect a single linked item ----------

export const unlinkPlaidItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z
      .object({
        plaid_item_id: z.string().min(1),
        clear_memory: z.boolean().optional(),
      })
      .parse(d);
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { purgePlaidItem } = await import("@/lib/plaid-purge.server");
    return purgePlaidItem(supabaseAdmin, {
      userId: context.userId,
      plaidItemId: data.plaid_item_id,
      clearMemory: data.clear_memory ?? false,
    });
  });

// ---------- full account offboarding ----------

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { purgeAllUserData } = await import("@/lib/plaid-purge.server");
    return purgeAllUserData(supabaseAdmin, context.userId);
  });

// ---------- sync top merchants ----------

type PlaidTxn = {
  merchant_name: string | null;
  name: string;
  amount: number;
  date: string;
  personal_finance_category?: { primary?: string } | null;
};

export const syncPlaidTopMerchants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { plaidPost } = await import("@/lib/plaid.server");

    const { data: items } = await supabaseAdmin
      .from("user_plaid_items")
      .select("id, plaid_item_id")
      .eq("user_id", context.userId);
    if (!items || items.length === 0) {
      return { merchants: [] as { name: string; count: number }[] };
    }

    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = new Date().toISOString().slice(0, 10);

    const merchantCounts = new Map<string, number>();

    for (const item of items) {
      const { data: priv } = await supabaseAdmin
        .from("user_plaid_items_private")
        .select("access_token")
        .eq("plaid_item_pk", item.id)
        .maybeSingle();
      if (!priv?.access_token) continue;
      try {
        const res = await plaidPost<{ transactions: PlaidTxn[] }>("/transactions/get", {
          access_token: priv.access_token,
          start_date: startStr,
          end_date: endStr,
          options: { count: 250, offset: 0 },
        });
        for (const t of res.transactions) {
          if (t.amount < 0) continue;
          const name = (t.merchant_name || t.name || "").trim();
          if (!name) continue;
          merchantCounts.set(name, (merchantCounts.get(name) ?? 0) + 1);
        }
      } catch (e) {
        console.error("[plaid] transactions/get", e);
      }
    }

    const merchants = Array.from(merchantCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    await supabaseAdmin
      .from("user_prefs")
      .update({
        plaid_last_sync_at: new Date().toISOString(),
        plaid_top_merchants: merchants,
      })
      .eq("user_id", context.userId);

    return { merchants };
  });

// ---------- linked items list (for UI unlink) ----------

export const listPlaidItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_plaid_items")
      .select(
        "plaid_item_id, institution_name, status, last_synced_at, created_at, needs_attention_at, webhook_code_last, new_accounts_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return { items: data ?? [] };
  });

// ---------- update-mode link token (reconnect OR add-new-accounts) ----------

export const createPlaidUpdateLinkToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z
      .object({
        plaid_item_id: z.string().min(1),
        account_selection_enabled: z.boolean().optional(),
      })
      .parse(d);
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { plaidPost, plaidEnv, plaidWebhookUrl } = await import("@/lib/plaid.server");

    const { data: itemRow } = await supabaseAdmin
      .from("user_plaid_items")
      .select("id, plaid_item_id")
      .eq("user_id", context.userId)
      .eq("plaid_item_id", data.plaid_item_id)
      .maybeSingle();
    if (!itemRow) throw new Error("Unknown Plaid item");

    const { data: priv } = await supabaseAdmin
      .from("user_plaid_items_private")
      .select("access_token")
      .eq("plaid_item_pk", itemRow.id)
      .maybeSingle();
    if (!priv?.access_token) throw new Error("Missing Plaid access token");

    const body: Record<string, unknown> = {
      user: { client_user_id: context.userId },
      client_name: "TAP",
      country_codes: ["US"],
      language: "en",
      access_token: priv.access_token,
      webhook: plaidWebhookUrl(),
    };

    if (data.account_selection_enabled) {
      body.update = { account_selection_enabled: true };
    }
    const res = await plaidPost<{ link_token: string }>("/link/token/create", body);
    return { link_token: res.link_token, env: plaidEnv() };
  });

// ---------- mark an item healthy after successful reconnect ----------

export const markPlaidItemHealthy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z.object({ plaid_item_id: z.string().min(1) }).parse(d);
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_plaid_items")
      .update({
        status: "active",
        needs_attention_at: null,
        webhook_code_last: null,
        error_last: null,
      })
      .eq("user_id", context.userId)
      .eq("plaid_item_id", data.plaid_item_id);
    await supabaseAdmin
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("dedupe_key", `plaid_reconnect:${data.plaid_item_id}`)
      .is("dismissed_at", null);
    return { ok: true };
  });

// ---------- new-accounts flow: detect + resolve ----------

export const detectPlaidNewCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z.object({ plaid_item_id: z.string().min(1) }).parse(d);
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { plaidPost, matchAccountToCatalog } = await import("@/lib/plaid.server");

    const { data: itemRow } = await supabaseAdmin
      .from("user_plaid_items")
      .select("id, institution_name")
      .eq("user_id", context.userId)
      .eq("plaid_item_id", data.plaid_item_id)
      .maybeSingle();
    if (!itemRow) throw new Error("Unknown Plaid item");

    const { data: priv } = await supabaseAdmin
      .from("user_plaid_items_private")
      .select("access_token")
      .eq("plaid_item_pk", itemRow.id)
      .maybeSingle();
    if (!priv?.access_token) throw new Error("Missing Plaid access token");

    const acctRes = await plaidPost<{ accounts: PlaidAccount[] }>("/accounts/get", {
      access_token: priv.access_token,
    });

    const { data: existing } = await context.supabase
      .from("user_cards")
      .select("plaid_account_id")
      .eq("user_id", context.userId)
      .eq("plaid_item_id", data.plaid_item_id);
    const linked = new Set((existing ?? []).map((r) => r.plaid_account_id).filter(Boolean));

    const credit = acctRes.accounts.filter(
      (a) => (a.type === "credit" || a.subtype === "credit card") && !linked.has(a.account_id),
    );

    const candidates: PlaidCandidate[] = credit.map((a) => {
      const match = matchAccountToCatalog(
        itemRow.institution_name ?? "",
        a.official_name ?? a.name,
      );
      return {
        account_id: a.account_id,
        mask: a.mask,
        account_name: a.name,
        official_name: a.official_name,
        institution_name: itemRow.institution_name ?? null,
        suggested_catalog_id: match?.id ?? null,
        suggested_confidence: match?.score ?? 0,
      };
    });

    return { item_id: data.plaid_item_id, candidates };
  });

export const markPlaidNewAccountsResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (d: unknown) => {
    const { z } = await import("zod");
    return z.object({ plaid_item_id: z.string().min(1) }).parse(d);
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_plaid_items")
      .update({ new_accounts_at: null })
      .eq("user_id", context.userId)
      .eq("plaid_item_id", data.plaid_item_id);
    await supabaseAdmin
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("dedupe_key", `plaid_new_accounts:${data.plaid_item_id}`)
      .is("dismissed_at", null);
    return { ok: true };
  });
