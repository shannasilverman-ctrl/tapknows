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

// ── journey stages ─────────────────────────────────────────────────────────
//
// The customer-experience report asks feedback to isolate WHICH stage of the
// journey broke, instead of asking broadly and collecting an unactionable "it
// was confusing". These four are the stages it names. The set is canonical:
// the feedback sheet renders its options from here, so a visible label can
// never drift out of sync with what actually gets recorded.

export const FEEDBACK_STAGES = [
  { id: "finding_merchant", label: "Finding the store" },
  { id: "setting_up_cards", label: "Adding cards" },
  { id: "trusting_the_pick", label: "Trusting the pick" },
  { id: "understanding_the_math", label: "Understanding the math" },
] as const;

export type FeedbackStage = (typeof FEEDBACK_STAGES)[number];
export type FeedbackStageId = FeedbackStage["id"];

const STAGE_BY_ID = new Map<string, FeedbackStage>(FEEDBACK_STAGES.map((s) => [s.id, s]));

export function isFeedbackStageId(id: string): id is FeedbackStageId {
  return STAGE_BY_ID.has(id);
}

export function feedbackStageLabel(id: FeedbackStageId): string {
  return STAGE_BY_ID.get(id)?.label ?? id;
}

// The stage the customer most recently picked, recorded at SELECTION time
// rather than submit time — so the choice is observable without a network
// round trip. The e2e suite reads it back off `window`.
const STAGE_SINK_KEY = "__tapFeedbackStage";

/** The window key the e2e suite reads the recorded stage back from. */
export const FEEDBACK_STAGE_SINK_KEY = STAGE_SINK_KEY;

export function recordFeedbackStage(id: FeedbackStageId | null): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[STAGE_SINK_KEY] = id;
}

export function readRecordedFeedbackStage(): FeedbackStageId | null {
  if (typeof window === "undefined") return null;
  const v = (window as unknown as Record<string, unknown>)[STAGE_SINK_KEY];
  return typeof v === "string" && isFeedbackStageId(v) ? v : null;
}

export type FeedbackPayload = {
  chips: string[];
  text: string;
  /** Which journey stage broke, when the customer named one. */
  stage?: FeedbackStageId | null;
};

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const { chips, text, stage } = payload;
  const trimmed = text.trim().slice(0, 2000) || null;
  // The named stage is the most actionable signal, so it leads the chip list.
  const stageLabel = stage && isFeedbackStageId(stage) ? feedbackStageLabel(stage) : null;
  const cleanChips = Array.from(new Set([...(stageLabel ? [stageLabel] : []), ...chips])).slice(
    0,
    10,
  );

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
    stage: stage ?? null,
    has_text: !!trimmed,
    signed_in: !!uid,
  });
}
