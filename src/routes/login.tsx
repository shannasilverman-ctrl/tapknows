import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Wordmark } from "@/components/wordmark";
import { BRAND_TAGLINE } from "@/lib/brand";
import { AuthPanel } from "@/components/auth-panel";
import { useOnline } from "@/hooks/use-online";
import { ArrowLeft, WifiOff } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/home" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors min-h-11"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="flex justify-center">
              <Wordmark size="lg" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
          </div>
          {online ? (
            <AuthPanel />
          ) : (
            <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4 flex items-start gap-3">
              <WifiOff className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You're offline. Sign in will resume once you're back online — your wallet is safe on
                this device.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
