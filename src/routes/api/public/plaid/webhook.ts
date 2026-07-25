// Plaid webhook receiver. Verifies the JWT per Plaid's docs
// (https://plaid.com/docs/api/webhooks/webhook-verification/) and updates
// item status in Supabase for connection-health events.

import { createFileRoute } from "@tanstack/react-router";
import { importJWK, jwtVerify, decodeProtectedHeader } from "jose";

type PlaidWebhookKey = {
  alg: string;
  created_at: number;
  crv: string;
  expired_at: number | null;
  kid: string;
  kty: string;
  use: string;
  x: string;
  y: string;
};

const keyCache = new Map<string, PlaidWebhookKey>();

async function fetchVerificationKey(kid: string): Promise<PlaidWebhookKey> {
  const cached = keyCache.get(kid);
  if (cached && !cached.expired_at) return cached;
  const { plaidPost } = await import("@/lib/plaid.server");
  const res = await plaidPost<{ key: PlaidWebhookKey }>("/webhook_verification_key/get", {
    key_id: kid,
  });
  keyCache.set(kid, res.key);
  return res.key;
}

async function verifyWebhook(rawBody: string, jwt: string): Promise<boolean> {
  try {
    const header = decodeProtectedHeader(jwt);
    if (header.alg !== "ES256" || !header.kid) return false;
    const key = await fetchVerificationKey(header.kid);
    if (key.expired_at) return false;
    const publicKey = await importJWK(
      { kty: key.kty, crv: key.crv, x: key.x, y: key.y, alg: "ES256" },
      "ES256",
    );
    const { payload } = await jwtVerify(jwt, publicKey, {
      algorithms: ["ES256"],
      maxTokenAge: "5 minutes",
    });
    const expected = payload.request_body_sha256;
    if (typeof expected !== "string") return false;
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawBody));
    const actual = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return actual === expected;
  } catch (e) {
    console.error("[plaid webhook] verify", e);
    return false;
  }
}

type WebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string; error_message?: string } | null;
  new_webhook_url?: string;
};

const NEEDS_ATTENTION_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
]);

// Remote revocation: the user pulled our access at their bank. Treat as a
// forced disconnect — delete stored data and surface a quiet notice next
// time they open settings.
const REVOKED_CODES = new Set(["USER_PERMISSION_REVOKED", "USER_ACCOUNT_REVOKED"]);

async function handleItemEvent(body: WebhookBody) {
  if (!body.item_id) return;
  const code =
    body.webhook_code === "ERROR" && body.error?.error_code
      ? body.error.error_code
      : body.webhook_code;
  if (!code) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: item } = await supabaseAdmin
    .from("user_plaid_items")
    .select("id, user_id, institution_name")
    .eq("plaid_item_id", body.item_id)
    .maybeSingle();
  if (!item) return;

  const inst = item.institution_name?.trim() || "Your bank";
  const now = new Date().toISOString();

  // Remote revocation — purge stored data and drop a plaid_revoked notice.
  if (REVOKED_CODES.has(code)) {
    const { purgePlaidItem } = await import("@/lib/plaid-purge.server");
    await purgePlaidItem(supabaseAdmin, {
      userId: item.user_id,
      plaidItemId: body.item_id,
      clearMemory: false,
      deleteCards: false,
    });
    await supabaseAdmin.from("alerts").upsert(
      {
        user_id: item.user_id,
        kind: "plaid_revoked",
        severity: "info",
        title: `${inst} access was revoked from your bank's side`,
        body: "Your linked data has been removed. You can reconnect anytime.",
        action_label: null,
        deep_link: "/settings",
        entity_type: "plaid_item",
        entity_id: body.item_id,
        dedupe_key: `plaid_revoked:${body.item_id}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
    return;
  }

  // Broken connection — flip to needs_attention + open a single reconnect alert.
  if (NEEDS_ATTENTION_CODES.has(code)) {
    await supabaseAdmin
      .from("user_plaid_items")
      .update({
        status: "needs_attention",
        needs_attention_at: now,
        webhook_code_last: code,
        error_last: body.error?.error_message ?? null,
      })
      .eq("id", item.id);

    await supabaseAdmin.from("alerts").upsert(
      {
        user_id: item.user_id,
        kind: "plaid_reconnect",
        severity: "warn",
        title: `${inst} connection needs a quick reconnect`,
        body: "Reconnect to keep TAP learning from your spending.",
        action_label: "Reconnect",
        deep_link: `/settings?reconnect=${encodeURIComponent(body.item_id)}`,
        entity_type: "plaid_item",
        entity_id: body.item_id,
        dedupe_key: `plaid_reconnect:${body.item_id}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
    return;
  }

  // Connection healed itself — clear needs_attention + dismiss the alert.
  if (code === "LOGIN_REPAIRED") {
    await supabaseAdmin
      .from("user_plaid_items")
      .update({
        status: "active",
        needs_attention_at: null,
        webhook_code_last: code,
        error_last: null,
      })
      .eq("id", item.id);

    await supabaseAdmin
      .from("alerts")
      .update({ dismissed_at: now })
      .eq("user_id", item.user_id)
      .eq("dedupe_key", `plaid_reconnect:${body.item_id}`)
      .is("dismissed_at", null);
    return;
  }

  // New accounts opened at the institution — flag + open a single add-cards alert.
  if (code === "NEW_ACCOUNTS_AVAILABLE") {
    await supabaseAdmin
      .from("user_plaid_items")
      .update({
        new_accounts_at: now,
        webhook_code_last: code,
      })
      .eq("id", item.id);

    await supabaseAdmin.from("alerts").upsert(
      {
        user_id: item.user_id,
        kind: "plaid_new_accounts",
        severity: "info",
        title: `New card at ${inst}? Add it to your wallet.`,
        body: "Pick the new accounts to add and TAP will start optimizing them.",
        action_label: "Add cards",
        deep_link: `/settings?add_accounts=${encodeURIComponent(body.item_id)}`,
        entity_type: "plaid_item",
        entity_id: body.item_id,
        dedupe_key: `plaid_new_accounts:${body.item_id}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
    return;
  }
}

export const Route = createFileRoute("/api/public/plaid/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const jwt = request.headers.get("plaid-verification");
        const raw = await request.text();
        if (!jwt || !(await verifyWebhook(raw, jwt))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let body: WebhookBody;
        try {
          body = JSON.parse(raw) as WebhookBody;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        if (body.webhook_type === "ITEM") {
          await handleItemEvent(body);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
