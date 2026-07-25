import { useEffect, useState } from "react";
import { currentPushStatus, enablePush } from "@/lib/push";
import { needsHomeScreenInstall, isIOS } from "@/lib/pwa";
import { toast } from "sonner";
import { Bell, X, Share } from "lucide-react";

const DISMISS_KEY = "tap.push.primerDismissedAt";
const VISIT_KEY = "tap.visitCount";

function bumpVisit(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(localStorage.getItem(VISIT_KEY) ?? "0") + 1;
  localStorage.setItem(VISIT_KEY, String(n));
  return n;
}

export function PushPrimer() {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"enable" | "install">("enable");

  useEffect(() => {
    const visits = bumpVisit();
    if (visits < 2) return;
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
    if (dismissed && Date.now() - dismissed < 7 * 86400_000) return;

    if (needsHomeScreenInstall()) {
      setMode("install");
      setShow(true);
      return;
    }
    currentPushStatus().then((s) => {
      if (s === "prompt") {
        setMode("enable");
        setShow(true);
      }
    });
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (mode === "install") {
    return (
      <div className="mb-3 rounded-2xl bg-white border border-border px-4 py-3.5 flex items-start gap-3 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.15)]">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
          <Share className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground">
            Notifications need TAP on your Home Screen
          </p>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            On iPhone, tap the Share button in Safari, then Add to Home Screen. Open TAP from the
            icon and you can enable alerts.
          </p>
          <button
            onClick={dismiss}
            className="mt-2 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Got it
          </button>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground p-1 shrink-0"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-2xl bg-white border border-border px-4 py-3.5 flex items-start gap-3 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.15)]">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
        <Bell className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">
          Get notified before offers expire
        </p>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
          A quiet ping for rotating 5% categories, expiring offers, and welcome-bonus deadlines.
          Nothing else.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={async () => {
              const res = await enablePush();
              if (res.ok) {
                toast.success("Notifications on");
                setShow(false);
              } else if (res.reason === "not-configured") {
                toast.info("Push isn't configured yet. In-app alerts are on.");
                dismiss();
              } else if (res.reason === "denied") {
                toast.error(
                  isIOS()
                    ? "Enable notifications in Settings → TAP."
                    : "Enable notifications in your browser settings.",
                );
              } else {
                setShow(false);
              }
            }}
            className="text-[13px] font-semibold rounded-full bg-primary text-primary-foreground px-4 py-1.5"
          >
            Turn on
          </button>
          <button
            onClick={dismiss}
            className="text-[13px] text-muted-foreground hover:text-foreground px-2 py-1.5"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground p-1 shrink-0"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
