import { useState } from "react";
import { Sheet } from "@/components/sheet";
import {
  FEEDBACK_STAGES,
  markFeedbackShown,
  recordFeedbackStage,
  submitFeedback,
  type FeedbackStageId,
} from "@/lib/feedback";
import { toast } from "sonner";

// Stage options render from the canonical set in `lib/feedback` so a visible
// label can never drift from what gets recorded. The two catch-all chips stay
// separate — they are not journey stages, they are exits.
const CHIPS = ["Nothing — it worked", "Something else"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * One-question voice loop. Ten seconds, one screen.
 * Marks itself as shown on any exit path (send, skip, dismiss) so it never
 * reappears from the automatic trigger.
 */
export function FeedbackSheet({ open, onClose }: Props) {
  const [stage, setStage] = useState<FeedbackStageId | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Single-select: naming one broken stage is the point. Tapping the active
  // stage again clears it.
  const pickStage = (id: FeedbackStageId) => {
    const next = stage === id ? null : id;
    setStage(next);
    recordFeedbackStage(next);
  };

  const toggleChip = (c: string) => {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const dismiss = () => {
    markFeedbackShown();
    setStage(null);
    recordFeedbackStage(null);
    setChips([]);
    setText("");
    onClose();
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await submitFeedback({ chips, text, stage });
      toast.success("Thanks — noted.");
      dismiss();
    } catch (e) {
      console.error("[feedback]", e);
      toast.error("Couldn't send. Try again.");
      setBusy(false);
    }
  };

  const canSend = !!stage || chips.length > 0 || text.trim().length > 0;

  return (
    <Sheet open={open} onClose={dismiss} title="Quick feedback" busy={busy}>
      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
        Which part felt hard or uncertain?
      </p>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="feedback-stages">
        {FEEDBACK_STAGES.map((s) => {
          const active = stage === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => pickStage(s.id)}
              aria-pressed={active}
              data-testid={`feedback-stage-${s.id}`}
              data-stage-id={s.id}
              className={[
                "min-h-11 px-3.5 rounded-full text-[13px] font-medium transition-colors",
                active
                  ? "bg-foreground text-background border border-foreground"
                  : "bg-white text-foreground border border-border hover:border-foreground/40",
              ].join(" ")}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = chips.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleChip(c)}
              aria-pressed={active}
              className={[
                "min-h-11 px-3.5 rounded-full text-[13px] font-medium transition-colors",
                active
                  ? "bg-foreground text-background border border-foreground"
                  : "bg-white text-foreground border border-border hover:border-foreground/40",
              ].join(" ")}
            >
              {c}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Optional detail</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Anything else? (optional)"
          rows={3}
          maxLength={2000}
          className="w-full rounded-2xl border border-border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="min-h-11 px-3 text-[14px] font-medium text-muted-foreground hover:text-foreground"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy || !canSend}
          className="inline-flex items-center justify-center h-12 px-6 rounded-full bg-foreground text-background text-[14px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </Sheet>
  );
}
