import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Apple, ArrowRight } from "lucide-react";

type Props = {
  /** Optional: called after a successful email magic-link request (not a full sign-in). */
  onMagicSent?: () => void;
  /** Compact = single-column, no big wordmark; used inside the save sheet. */
  compact?: boolean;
};

/**
 * Shared auth surface: Apple, Google, and email magic link.
 * Used by both /login and the SaveWalletSheet. Sign-in itself is caught by
 * the root's onAuthStateChange → useGuestMigration → toast + redirect flow.
 */
export function AuthPanel({ onMagicSent, compact }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"apple" | "google" | "email" | null>(null);

  const handleOAuth = async (provider: "apple" | "google") => {
    setBusy(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/home`,
        queryParams:
          provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined,
      },
    });
    if (error) {
      toast.error(`${provider === "apple" ? "Apple" : "Google"} sign-in failed`);
      setBusy(null);
    }
    // On success, root onAuthStateChange handles migration.
  };

  const handleMagic = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy("email");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Magic link sent — check your email.");
      onMagicSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={compact ? "" : "w-full max-w-sm mx-auto"}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => handleOAuth("apple")}
          disabled={busy !== null}
          className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-xl bg-foreground text-background text-[15px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Apple className="size-5" />
          Continue with Apple
        </button>
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={busy !== null}
          className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-xl bg-white border border-border-strong text-[15px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <GoogleGlyph />
          Continue with Google
        </button>
      </div>

      <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or email me a link</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleMagic} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-[52px] rounded-xl border border-border bg-white pl-10 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <button
          type="submit"
          disabled={busy !== null || !email}
          aria-label="Send magic link"
          className="inline-flex items-center justify-center h-[52px] w-[52px] rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <ArrowRight className="size-5" />
        </button>
      </form>

      <p className="mt-4 text-[11px] text-muted-foreground text-center leading-relaxed">
        No passwords. TAP never stores card numbers.
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
