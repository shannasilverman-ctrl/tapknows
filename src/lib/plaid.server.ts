// Server-only Plaid REST helpers.
// No SDK — pure fetch keeps the Worker bundle small and avoids Node deps.

const PLAID_HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

function creds() {
  const client_id = process.env.PLAID_CLIENT_ID;
  const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  // Prefer env-specific secret when present; fall back to the sandbox one
  // since that's the only secret set today. Any host URL is derived from env.
  const secret =
    (env === "production" && process.env.PLAID_PRODUCTION_SECRET) ||
    (env === "development" && process.env.PLAID_DEVELOPMENT_SECRET) ||
    process.env.PLAID_SANDBOX_SECRET;
  if (!client_id || !secret) {
    throw new Error("Plaid is not configured (missing PLAID_CLIENT_ID or environment secret).");
  }
  const host = PLAID_HOSTS[env] ?? PLAID_HOSTS.sandbox;
  return { client_id, secret, env, host };
}

/** True when running against Plaid Sandbox. Used to gate /sandbox/* calls. */
export function isPlaidSandbox(): boolean {
  return (process.env.PLAID_ENV ?? "sandbox").toLowerCase() === "sandbox";
}

/**
 * Plaid production limited-mode cap on linked Items for this account. Single
 * constant so raising the cap after Plaid approves the full production
 * application is a one-line edit.
 */
export const PLAID_ITEM_CAP = 10;

/**
 * Tagged error thrown by createPlaidLinkToken when the account-wide Item cap
 * has been hit. The UI catches this to swap in the "at capacity" sheet
 * instead of surfacing a raw Plaid error.
 */
export const PLAID_CAP_ERROR = "PLAID_CAP_REACHED";

/**
 * Webhook URL registered with every link token so item events reach us in
 * production. Falls back to the current live preview host if the custom
 * domain isn't yet resolving in this environment.
 */
export function plaidWebhookUrl(): string {
  const custom = process.env.PLAID_WEBHOOK_URL;
  if (custom) return custom;
  return "https://tapknows.com/api/public/plaid/webhook";
}

export async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { client_id, secret, host } = creds();
  // Hard guard: any /sandbox/* namespace call is refused outside sandbox so
  // test-only flows (force-expire, webhook fire, transactions/refresh) cannot
  // hit production even if a caller forgets to check.
  if (path.startsWith("/sandbox/") && !isPlaidSandbox()) {
    throw new Error(`Plaid sandbox endpoint ${path} is disabled outside PLAID_ENV=sandbox`);
  }
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, secret, ...body }),
  });
  const text = await res.text();
  if (!res.ok) {
    // Plaid returns a JSON body with error_code / error_message / error_type on
    // every non-2xx. Surface it in the thrown message so the client toast and
    // server logs actually say "INVALID_API_KEYS" instead of just "500".
    let code = "unknown_error";
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error_code?: string; error_message?: string };
      code = j.error_code ?? code;
      message = j.error_message ?? message;
    } catch {
      /* not JSON; keep raw */
    }
    console.error("[plaid]", path, res.status, code, message);
    throw new Error(`Plaid ${path} failed: ${code} — ${message}`);
  }
  return JSON.parse(text) as T;
}

export function plaidEnv(): string {
  return (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
}

// ---------- catalog matcher (moved out of *.functions.ts so the server-fn
// splitter isn't forced to keep sibling runtime declarations reachable from
// handler bodies) ----------

import { CARD_CATALOG } from "@/lib/cardCatalog";

/**
 * Score a Plaid account name/institution against the catalog. Small
 * heuristic: share of tokens matching card name + issuer bonus.
 * Returns best over 0.35, else null.
 */
export function matchAccountToCatalog(
  institution: string,
  accountName: string,
): { id: string; score: number } | null {
  const inst = institution.toLowerCase();
  const acct = accountName.toLowerCase();
  let best: { id: string; score: number } | null = null;
  for (const c of CARD_CATALOG) {
    const issuer = c.issuer.toLowerCase();
    const cardName = c.name.toLowerCase();
    let score = 0;
    const issuerTokens = issuer.split(/\s+/).filter(Boolean);
    if (issuerTokens.some((t) => inst.includes(t))) score += 0.35;
    if (issuerTokens.some((t) => acct.includes(t))) score += 0.2;
    const nameTokens = cardName.split(/\s+/).filter((t) => t.length > 2);
    if (nameTokens.length > 0) {
      const hits = nameTokens.filter((t) => acct.includes(t)).length;
      score += 0.5 * (hits / nameTokens.length);
    }
    if (score > (best?.score ?? 0)) best = { id: c.id, score };
  }
  if (!best || best.score < 0.35) return null;
  return best;
}
