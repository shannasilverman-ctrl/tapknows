import type { HTMLAttributes, ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpenText,
  CreditCard,
  History,
  Home,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export type TapAppShellProps = HTMLAttributes<HTMLDivElement> & {
  surface?: "canvas" | "decision";
};

export function TapAppShell({ surface = "canvas", className, ...props }: TapAppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user } = useAuth();
  const railItems = [
    { to: "/home", label: "Decide", icon: Home },
    { to: "/cards", label: "Wallet", icon: CreditCard },
    { to: "/plan", label: "Plan", icon: Wand2 },
    { to: "/cheat-sheet", label: "Cheat sheet", icon: BookOpenText },
    ...(user
      ? [
          { to: "/purchases", label: "Review", icon: History },
          { to: "/alerts", label: "Alerts", icon: Bell },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        "cs-app-body min-h-screen flex flex-col text-foreground",
        surface === "canvas" ? "tap-consumer-screen bg-background" : "tap-decision-screen",
        className,
      )}
      data-tap-surface={surface}
      {...props}
    >
      <aside className="tap-desktop-rail" aria-label="TAP workspace">
        <Link to="/home" className="tap-desktop-brand" aria-label="TAP home">
          <span className="tap-desktop-wordmark">
            TAP
            <i aria-hidden />
          </span>
          <span>Your card copilot</span>
        </Link>

        <nav aria-label="Desktop primary">
          {railItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to === "/home" && pathname === "/decide");
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className="tap-desktop-nav-item"
                data-active={active ? "true" : "false"}
              >
                <Icon aria-hidden />
                <span>{item.label}</span>
                {active ? <i aria-hidden /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="tap-desktop-rail-note">
          <span>
            <ShieldCheck aria-hidden />
            Independent recommendation
          </span>
          <p>TAP compares only the cards in your wallet. No card number required.</p>
        </div>

        <Link to="/demo" className="tap-desktop-demo-link">
          <Sparkles aria-hidden />
          See a 30-second TAP
        </Link>
      </aside>
      {props.children}
    </div>
  );
}

export type TapPageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

export function TapPageHeader({
  title,
  subtitle,
  leading,
  trailing,
  className,
}: TapPageHeaderProps) {
  return (
    <header className={cn("tap-page-header", className)}>
      {leading ? <div className="tap-page-header-leading">{leading}</div> : null}
      <div className="tap-page-header-copy">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {trailing ? <div className="tap-page-header-trailing">{trailing}</div> : null}
    </header>
  );
}

export function ValueDifference({
  label = "Estimated difference",
  value,
  className,
}: {
  label?: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tap-value-difference", className)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function RecommendationHero({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("tap-recommendation-hero", className)}>{children}</section>;
}

export function TapEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("tap-empty-state", className)}>
      {icon ? <div className="tap-empty-state-icon">{icon}</div> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="tap-empty-state-action">{action}</div> : null}
    </section>
  );
}

export { BottomNav as TapBottomNav } from "@/components/bottom-nav";
export { Sheet as TapSheet } from "@/components/sheet";
