// Local state for the one-time "voice loop" feedback prompt.
// Fires once after the 3rd lifetime decide; never again regardless of answer.

import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/lib/appVersion";

const DECIDE_COUNT_KEY = "tap.decideCountLifetime";
const SHOWN_KEY = "tap.feedbackShown";
const DUE_KEY = "tap.feedbackDue";
const CLIENT_ID_KEY = "tap.clientId";

/** Bump the lifetime decide count; return the new value. Safe on SSR. */
export function bumpDecideCount(): number {
  if (typeof window === "undefined") return 0;
  const prev = Number(window.localStorage.getItem(DECIDE_COUNT_KEY) ?? "0") || 0;
  const next = prev + 1;
  try {
    window.localStorage.setItem(DECIDE_COUNT_KEY, String(next));
    if (next === 3 && !hasSeenFeedback()) {
      window.localStorage.setItem(DUE_KEY, "1");
    }
  } catch {}
  return next;
}

export function hasSeenFeedback(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SHOWN_KEY) === "1";
}

export function isFeedbackDue(): boolean {
  if (typeof window === "undefined") return false;
  if (hasSeenFeedback()) return false;
  return window.localStorage.getItem(DUE_KEY) === "1";
}

export function markFeedbackShown(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHOWN_KEY, "1");
    window.localStorage.removeItem(DUE_KEY);
  } catch {}
}

function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      window.localStorage.setItem(CLIENT_ID_KEY, id);
    } catch {}
  }
  return id;
}

export type FeedbackPayload = {
  chips: string[];
  text: string;
};

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const { chips, text } = payload;
  const trimmed = text.trim().slice(0, 2000) || null;
  const cleanChips = Array.from(new Set(chips)).slice(0, 10);

  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;

  const row = {
    user_id: uid,
    client_id: uid ? null : getClientId(),
    chips: cleanChips,
    text: trimmed,
    app_version: APP_VERSION,
    path: typeof window !== "undefined" ? window.location.pathname : null,
  };

  const { error } = await supabase.from("feedback").insert(row);
  if (error) throw error;

  // Analytics event — the insert itself is the source of truth; log for parity
  // with the rest of the client-side event trail.
  console.info("[analytics] feedback_submitted", {
    chips: cleanChips,
    has_text: !!trimmed,
    signed_in: !!uid,
  });
}
