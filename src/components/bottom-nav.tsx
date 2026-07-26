import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CreditCard, Home, LogIn, Sliders, Wand2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getUnreadAlertCount } from "@/lib/alerts.functions";
import { LegalFooter } from "@/components/legal-footer";

const signedInItems = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/cards", label: "Wallet", icon: CreditCard },
  { to: "/plan", label: "Plan", icon: Wand2 },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/settings", label: "Settings", icon: Sliders },
] as const;

const guestItems = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/cards", label: "Wallet", icon: CreditCard },
  { to: "/plan", label: "Plan", icon: Wand2 },
  { to: "/login", label: "Sign in", icon: LogIn },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const getCount = useServerFn(getUnreadAlertCount);
  const [unread, setUnread] = useState(0);
  const items = user ? signedInItems : guestItems;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = () => {
      getCount({})
        .then((r) => !cancelled && setUnread(r.count))
        .catch(() => {});
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user, getCount, pathname]);

  return (
    <>
      <LegalFooter />
      <nav
        aria-label="Primary"
        className="border-t border-x border-border bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around text-xs sticky bottom-0 w-full max-w-md mx-auto rounded-t-2xl shadow-[0_-10px_30px_rgba(36,21,43,0.05)]"
      >
        {items.map((it) => {
          const active = pathname === it.to;
          const Icon = it.icon;
          const showDot = it.to === "/alerts" && unread > 0;
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : "false"}
              className={`tap-nav-item flex flex-col items-center justify-center gap-0.5 min-h-11 min-w-11 px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative inline-flex">
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {showDot && (
                  <span
                    aria-label={`${unread} unread`}
                    className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground flex items-center justify-center leading-none"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              <span className={active ? "font-medium" : ""}>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
