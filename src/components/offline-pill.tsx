import { useOnline } from "@/hooks/use-online";
import { WifiOff } from "lucide-react";

/** Quiet pill shown when the device is offline. Fits any header row. */
export function OfflinePill({ className = "" }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-secondary border border-border text-[11px] font-medium text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="size-3" aria-hidden />
      Offline
    </span>
  );
}
