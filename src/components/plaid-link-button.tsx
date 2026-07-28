import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { Loader2, Landmark, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  createPlaidLinkToken,
  createPlaidUpdateLinkToken,
  detectPlaidNewCards,
  exchangePublicToken,
  markPlaidItemHealthy,
  markPlaidNewAccountsResolved,
  type PlaidCandidate,
} from "@/lib/plaid.functions";
import { toast } from "sonner";
import { PlaidMatchSheet } from "@/components/plaid-match-sheet";

type Props = {
  onComplete?: () => void;
  onNeedAuth?: () => void;
  /** Called when the server rejects link-token creation with PLAID_CAP_REACHED.
   *  Parent should open the calm capacity sheet and offer the manual path. */
  onAtCapacity?: () => void;
  variant?: "primary" | "secondary";
  label?: string;
  /** When set, opens Plaid Link in update mode to re-authenticate. */
  updateForItemId?: string;
  /** When set, opens Link in update mode with account_selection_enabled. */
  addAccountsForItemId?: string;
};

/**
 * Connect-your-bank button. Guests are routed to auth first via onNeedAuth.
 * On success shows the match sheet where the user confirms card matches.
 * In update mode (updateForItemId), reopens Link for a broken connection and
 * clears the needs-attention status on success.
 * In add-accounts mode (addAccountsForItemId), reopens Link with account
 * selection enabled and runs card detection on the newly selected accounts.
 */
export function PlaidLinkButton({
  onNeedAuth,
  variant = "primary",
  label = "Connect your bank",
  ...props
}: Props) {
  const { user } = useAuth();

  // Guests only need the account gate. Mounting Plaid's hook here would load
  // its third-party SDK before consent and, when several dormant entry points
  // exist on a page, can inject the SDK repeatedly.
  if (!user) {
    const base =
      variant === "primary"
        ? "w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold hover:opacity-90 transition-opacity"
        : "w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-white text-[15px] font-medium text-foreground hover:border-primary/40 transition-colors";

    return (
      <>
        <button type="button" onClick={onNeedAuth} className={base}>
          <Landmark className="size-4" strokeWidth={2} />
          {label}
        </button>
        <PlaidPrivacyCopy />
      </>
    );
  }

  return (
    <AuthenticatedPlaidLinkButton
      {...props}
      onNeedAuth={onNeedAuth}
      variant={variant}
      label={label}
    />
  );
}

function AuthenticatedPlaidLinkButton({
  onComplete,
  onAtCapacity,
  variant = "primary",
  label = "Connect your bank",
  updateForItemId,
  addAccountsForItemId,
}: Props) {
  const createToken = useServerFn(createPlaidLinkToken);
  const createUpdate = useServerFn(createPlaidUpdateLinkToken);
  const markHealthy = useServerFn(markPlaidItemHealthy);
  const detectNew = useServerFn(detectPlaidNewCards);
  const resolveNew = useServerFn(markPlaidNewAccountsResolved);
  const exchange = useServerFn(exchangePublicToken);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState<string>("sandbox");
  const [matches, setMatches] = useState<PlaidCandidate[] | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [addAccountsFlow, setAddAccountsFlow] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (linkToken) return;
    let load: Promise<{ link_token: string; env: string }>;
    if (addAccountsForItemId) {
      load = createUpdate({
        data: { plaid_item_id: addAccountsForItemId, account_selection_enabled: true },
      });
    } else if (updateForItemId) {
      load = createUpdate({ data: { plaid_item_id: updateForItemId } });
    } else {
      load = createToken();
    }
    load
      .then((r) => {
        setLinkToken(r.link_token);
        setEnv(r.env);
        setTokenError(null);
      })
      .catch((e: unknown) => {
        const raw = e instanceof Error ? e.message : String(e);
        // Capacity guard from the server — surface the calm sheet instead of a
        // raw Plaid error. Also emit an analytics event so we know it hit.
        if (raw.includes("PLAID_CAP_REACHED")) {
          console.info("[analytics] plaid_cap_reached");
          onAtCapacity?.();
          setTokenError(null);
          return;
        }
        // Extract the Plaid error_code / message we now surface from plaidPost.
        const msg = raw.replace(/^Plaid \/[^ ]+ failed: /, "");
        console.error("[plaid] link_token create failed:", raw);
        setTokenError(msg || "Couldn't reach Plaid. Try again.");
        toast.error(`Plaid: ${msg}`);
      });
  }, [
    linkToken,
    createToken,
    createUpdate,
    updateForItemId,
    addAccountsForItemId,
    retryTick,
    onAtCapacity,
  ]);

  const onSuccess = useCallback(
    async (public_token: string, meta: PlaidLinkOnSuccessMetadata) => {
      setBusy(true);
      try {
        if (addAccountsForItemId) {
          const res = await detectNew({ data: { plaid_item_id: addAccountsForItemId } });
          setItemId(res.item_id);
          if (res.candidates.length === 0) {
            await resolveNew({ data: { plaid_item_id: addAccountsForItemId } });
            toast.success("No new cards to add.");
            onComplete?.();
          } else {
            setAddAccountsFlow(true);
            setMatches(res.candidates);
          }
          return;
        }
        if (updateForItemId) {
          await markHealthy({ data: { plaid_item_id: updateForItemId } });
          toast.success("Bank reconnected.");
          onComplete?.();
          return;
        }
        const res = await exchange({
          data: {
            public_token,
            institution_name: meta.institution?.name ?? null,
            institution_id: meta.institution?.institution_id ?? null,
          },
        });
        setItemId(res.item_id);
        if (res.candidates.length === 0) {
          toast.success("Bank linked. No credit cards on this account.");
          onComplete?.();
        } else {
          setMatches(res.candidates);
        }
      } catch (e) {
        console.error(e);
        toast.error(
          updateForItemId || addAccountsForItemId
            ? "Something went wrong. Try again."
            : "Couldn't link that bank. Try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [
      exchange,
      markHealthy,
      detectNew,
      resolveNew,
      onComplete,
      updateForItemId,
      addAccountsForItemId,
    ],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? null,
    onSuccess,
  });

  const handleClick = () => {
    if (tokenError) {
      // Retry token creation instead of silently doing nothing.
      setTokenError(null);
      setLinkToken(null);
      setRetryTick((n) => n + 1);
      return;
    }
    if (ready && linkToken) {
      open();
    } else if (!linkToken) {
      toast.info("Still connecting to Plaid…");
    }
  };

  // Never fully disable the button — a dead click is invisible failure.
  // Only disable during an in-flight exchange.
  const disabled = busy;
  const preparing = !tokenError && (!linkToken || !ready);

  const base =
    variant === "primary"
      ? "w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      : "w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-white text-[15px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-60";

  return (
    <>
      <button type="button" onClick={handleClick} disabled={disabled} className={base}>
        {busy || preparing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : tokenError ? (
          <RefreshCw className="size-4" strokeWidth={2} />
        ) : (
          <Landmark className="size-4" strokeWidth={2} />
        )}
        {tokenError ? "Try again" : preparing ? "Preparing…" : label}
      </button>
      {tokenError && (
        <p className="mt-2 text-center text-[12px] leading-snug text-destructive">{tokenError}</p>
      )}
      <PlaidPrivacyCopy />
      {env === "sandbox" && !tokenError && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Sandbox mode — test institutions only.
        </p>
      )}

      {matches && itemId && (
        <PlaidMatchSheet
          open
          itemId={itemId}
          candidates={matches}
          onClose={() => {
            const finishedItem = itemId;
            const wasAddAccounts = addAccountsFlow;
            setMatches(null);
            setItemId(null);
            setAddAccountsFlow(false);
            if (wasAddAccounts && finishedItem) {
              resolveNew({ data: { plaid_item_id: finishedItem } }).catch(() => {});
            }
            // Refetch wallet + linked-banks so newly added cards appear.
            router.invalidate().catch(() => {});
            onComplete?.();
          }}
        />
      )}
    </>
  );
}

function PlaidPrivacyCopy() {
  return (
    <p className="mt-2 text-center text-[12px] leading-snug text-muted-foreground">
      TAP uses Plaid to link your bank. We see transactions to learn your merchants, never your
      login, and you can{" "}
      <a href="/privacy" className="underline underline-offset-2">
        disconnect and delete anytime
      </a>
      .
    </p>
  );
}
