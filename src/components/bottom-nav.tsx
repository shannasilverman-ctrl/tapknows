import { Link, useLocation } from "@tanstack/react-router";
import { BookOpenText, CreditCard, History, Home, LogIn, Wand2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LegalFooter } from "@/components/legal-footer";

const signedInItems = [
  { to: "/home", label: "Decide", icon: Home },
  { to: "/cards", label: "Wallet", icon: CreditCard },
  { to: "/plan", label: "Plan", icon: Wand2 },
  { to: "/purchases", label: "Review", icon: History },
  { to: "/cheat-sheet", label: "Cheat", icon: BookOpenText },
] as const;

const guestItems = [
  { to: "/home", label: "Decide", icon: Home },
  { to: "/cards", label: "Wallet", icon: CreditCard },
  { to: "/plan", label: "Plan", icon: Wand2 },
  { to: "/cheat-sheet", label: "Cheat", icon: BookOpenText },
  { to: "/login", label: "Sign in", icon: LogIn },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const items = user ? signedInItems : guestItems;

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
              </span>
              <span className={active ? "font-medium" : ""}>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
