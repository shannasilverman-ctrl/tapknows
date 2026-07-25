import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearGuestWallet, getGuestWallet, hasGuestData } from "@/lib/guestWallet";
import { toast } from "sonner";

const RECOVERED_KEY = "tap_recovered_v1";
const FIRST_DECIDE_KEY = "tap.firstDecideDone";
const PRIORITIES_KEY = "tap.priorities";
const PRESET_KEY = "tap.priorityPreset";

function readLocal<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    // Support both JSON and raw strings.
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return null;
  }
}

/**
 * Mount once at the root. On SIGNED_IN, if a guest wallet OR local
 * priorities / recovered history / first-decide marker exist, migrate
 * them into the account. Guest data is cleared on success.
 */
export function useGuestMigration(): void {
  const inFlight = useRef(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== "SIGNED_IN") return;
      if (inFlight.current) return;
      const userId = session?.user?.id;
      if (!userId) return;

      const hasWallet = hasGuestData();
      const priorityPreset = readLocal<string>(PRESET_KEY);
      const priorityValues = readLocal<Record<string, unknown>>(PRIORITIES_KEY);
      const recoveredRaw = readLocal<{ entries: unknown }>(RECOVERED_KEY);
      const firstDecide = readLocal<string>(FIRST_DECIDE_KEY);

      const hasExtras = !!priorityPreset || !!priorityValues || !!recoveredRaw || !!firstDecide;

      if (!hasWallet && !hasExtras) return;

      inFlight.current = true;
      try {
        if (hasWallet) {
          const gw = getGuestWallet();
          const payload = {
            cards: gw.cards,
            offers: gw.offers,
            overrides: gw.overrides,
            accounts: gw.accounts,
          };
          const { error } = await supabase.rpc(
            "migrate_guest_wallet" as never,
            { payload } as never,
          );
          if (error) throw error;
        }

        if (hasExtras) {
          const firstDecideIso =
            firstDecide && /\d{4}-\d{2}-\d{2}T/.test(firstDecide)
              ? firstDecide
              : firstDecide
                ? new Date().toISOString()
                : null;
          const { error: prefsErr } = await supabase.from("user_prefs").upsert(
            {
              user_id: userId,
              priority_preset: priorityPreset ?? null,
              priority_values: (priorityValues ?? null) as never,
              recovered_entries: (recoveredRaw ?? null) as never,
              first_decide_at: firstDecideIso,
            },
            { onConflict: "user_id" },
          );
          if (prefsErr) throw prefsErr;
        }

        if (hasWallet) clearGuestWallet();
        toast.success("Wallet saved.");
      } catch (err) {
        console.error("guest migration failed", err);
        toast.error("Couldn't save your wallet. Try again.");
      } finally {
        inFlight.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, []);
}
