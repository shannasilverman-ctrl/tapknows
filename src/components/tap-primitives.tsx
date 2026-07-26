import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TapAppShellProps = HTMLAttributes<HTMLDivElement> & {
  surface?: "canvas" | "decision";
};

export function TapAppShell({ surface = "canvas", className, ...props }: TapAppShellProps) {
  return (
    <div
      className={cn(
        "cs-app-body min-h-screen flex flex-col text-foreground",
        surface === "canvas" ? "tap-consumer-screen bg-background" : "tap-decision-screen",
        className,
      )}
      data-tap-surface={surface}
      {...props}
    />
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
