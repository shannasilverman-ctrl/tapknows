import { useEffect, useState } from "react";
import { Sheet } from "@/components/sheet";
import { enablePush, currentPushStatus } from "@/lib/push";
import { needsHomeScreenInstall, isIOS } from "@/lib/pwa";
import { toast } from "sonner";
import { Bell, Share } from "lucide-react";

const SESSION_DISMISS_KEY = "tap.pushAskDismissedSession";
const ASKED_KEY = "tap.pushAskedAt";

type Props = { open: boolean; onClose: () => void };

/**
 * Contextual push permission sheet. Shown once after the user's first
 * completed decide. Respects installed-vs-Safari logic and never re-asks
 * in the same session after "Not now".
 */
export function ContextualPushSheet({ open, onClose }: Props) {
  const [mode, setMode] = useState<"enable" | "install" | "hidden">("hidden");

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_DISMISS_KEY)) {
      onClose();
      return;
    }
    if (needsHomeScreenInstall()) {
      setMode("install");
      return;
    }
    currentPushStatus().then((s) => {
      if (s === "prompt") setMode("enable");
      else {
        // Already granted, denied, unsupported, or preview — nothing to ask.
        onClose();
      }
    });
  }, [open, onClose]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
      localStorage.setItem(ASKED_KEY, String(Date.now()));
    } catch {}
    setMode("hidden");
    onClose();
  };

  return (
    <Sheet
      open={open && mode !== "hidden"}
      onClose={dismiss}
      title="Want TAP to nudge you next time?"
    >
      {mode === "install" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Share className="size-5" />
            </span>
            <p className="text-[14px] text-foreground leading-relaxed">
              On iPhone, nudges need TAP on your Home Screen. Tap Share in Safari, then Add to Home
              Screen. Open TAP from the icon to enable alerts.
            </p>
          </div>
          <button onClick={dismiss} className="w-full cs-btn-primary h-[52px] text-[15px]">
            Got it
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Bell className="size-5" />
            </span>
            <p className="text-[14px] text-foreground leading-relaxed">
              A quiet ping when a rotating category flips, an offer is about to expire, or a welcome
              bonus is close. Nothing else.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={dismiss}
              className="w-full h-[44px] text-[14px] text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
            <button
              onClick={async () => {
                const res = await enablePush();
                if (res.ok) {
                  toast.success("Notifications on");
                  dismiss();
                } else if (res.reason === "not-configured") {
                  toast.info("In-app alerts are on. Push coming soon.");
                  dismiss();
                } else if (res.reason === "denied") {
                  toast.error(
                    isIOS()
                      ? "Enable notifications in Settings → TAP."
                      : "Enable notifications in your browser settings.",
                  );
                  dismiss();
                } else {
                  dismiss();
                }
              }}
              className="w-full cs-btn-primary h-[52px] text-[15px]"
            >
              Enable
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
