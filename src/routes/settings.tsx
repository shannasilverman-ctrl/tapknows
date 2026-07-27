import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { toast } from "sonner";
import type { CardCatalog, PointsProgram, UserCard } from "@/lib/types";
import { CreditHealthSettings } from "@/components/credit-health-settings";
import { LinkedBanks } from "@/components/linked-banks";
import { LogOut, Trash2, MessageSquare } from "lucide-react";
import { FeedbackSheet } from "@/components/feedback-sheet";

import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { deleteMyAccount } from "@/lib/plaid.functions";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  validateSearch: z.object({
    reconnect: z.string().optional(),
    add_accounts: z.string().optional(),
  }),
});

type Row = {
  program: PointsProgram;
  yourCppCents: string;
  defaultCppCents: number;
  hasOverride: boolean;
};

function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { reconnect, add_accounts } = useSearch({ from: "/settings" });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [uc, cc, pp, ov] = await Promise.all([
        supabase.from("user_cards").select("*"),
        supabase.from("cards_catalog").select("*"),
        supabase.from("points_programs").select("*"),
        supabase.from("user_cpp_overrides").select("*"),
      ]);
      const catalog: Record<string, CardCatalog> = {};
      (cc.data ?? []).forEach((c: any) => (catalog[c.id] = c));
      const overrides: Record<string, number> = {};
      (ov.data ?? []).forEach((o: any) => (overrides[o.points_program_id] = Number(o.cpp)));
      const userCards = (uc.data ?? []) as UserCard[];

      // Which programs are relevant? Any user-card's program + include all transferable programs.
      const relevant = new Set<string>();
      for (const u of userCards) {
        const c = catalog[u.card_catalog_id];
        if (c?.points_program_id) relevant.add(c.points_program_id);
      }
      const programs = (pp.data ?? []) as PointsProgram[];
      // Also show all transferable programs so users can preset before adding cards
      programs.forEach((p) => p.kind !== "cashback" && relevant.add(p.id));

      const list: Row[] = programs
        .filter((p) => relevant.has(p.id) && p.kind !== "cashback")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => {
          const cpp = overrides[p.id] ?? p.default_cpp;
          return {
            program: p,
            yourCppCents: (cpp * 100).toFixed(2),
            defaultCppCents: p.default_cpp,
            hasOverride: overrides[p.id] != null,
          };
        });
      setRows(list);
    })();
  }, [user]);

  const save = async (programId: string, cppCentsStr: string) => {
    const cents = parseFloat(cppCentsStr);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Enter a value greater than 0");
      return;
    }
    const cpp = cents / 100;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("user_cpp_overrides")
      .upsert({ user_id: u.user!.id, points_program_id: programId, cpp });
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      setRows(
        (rs) =>
          rs?.map((r) =>
            r.program.id === programId
              ? { ...r, yourCppCents: cents.toFixed(2), hasOverride: true }
              : r,
          ) ?? null,
      );
    }
  };

  const reset = async (programId: string, defaultCpp: number) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("user_cpp_overrides")
      .delete()
      .eq("user_id", u.user!.id)
      .eq("points_program_id", programId);
    if (error) toast.error(error.message);
    else {
      toast.success("Reset to default");
      setRows(
        (rs) =>
          rs?.map((r) =>
            r.program.id === programId
              ? { ...r, yourCppCents: (defaultCpp * 100).toFixed(2), hasOverride: false }
              : r,
          ) ?? null,
      );
    }
  };

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  return (
    <div className="cs-app-body tap-consumer-screen min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4">
        <h1 className="text-base font-semibold text-foreground">Settings</h1>
      </header>

      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Redemption values
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            What's a point worth to you?
          </h2>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Every recommendation converts points to dollars using these values. Set what you
            actually get — transfer partners, portal, or a personal average.
          </p>
        </div>

        {!rows ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a card to configure redemption values.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <ProgramRow key={r.program.id} row={r} onSave={save} onReset={reset} />
            ))}
          </ul>
        )}

        <div className="mt-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Linked banks
          </p>
          <LinkedBanks autoReconnect={reconnect ?? null} autoAddAccounts={add_accounts ?? null} />
        </div>

        <CreditHealthSettings />

        <div className="mt-12 pt-6 border-t border-border space-y-6">
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="size-3.5" />
            Share feedback
          </button>
          <DeleteAccountPanel onDeleted={() => navigate({ to: "/" })} />
        </div>
      </main>

      <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <BottomNav />
    </div>
  );
}

function ProgramRow({
  row,
  onSave,
  onReset,
}: {
  row: Row;
  onSave: (programId: string, cppCentsStr: string) => void;
  onReset: (programId: string, defaultCpp: number) => void;
}) {
  const [value, setValue] = useState(row.yourCppCents);
  useMemo(() => setValue(row.yourCppCents), [row.yourCppCents]);
  const dirty = value !== row.yourCppCents;
  return (
    <li className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{row.program.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Default {(row.defaultCppCents * 100).toFixed(2)}¢ ·{" "}
            {row.hasOverride ? "customized" : "using default"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <input
              inputMode="decimal"
              // The program name is in a sibling heading with no association,
              // so this control had no name at all in a screen reader.
              aria-label={`${row.program.name} value, cents per point`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background pl-2 pr-6 py-1.5 text-sm text-right tabular-nums"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ¢
            </span>
          </div>
          {dirty ? (
            <button
              onClick={() => onSave(row.program.id, value)}
              className="text-xs font-medium rounded-lg bg-foreground text-background px-2.5 py-1.5"
            >
              Save
            </button>
          ) : row.hasOverride ? (
            <button
              onClick={() => onReset(row.program.id, row.defaultCppCents)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function DeleteAccountPanel({ onDeleted }: { onDeleted: () => void }) {
  const deleteAccount = useServerFn(deleteMyAccount);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-2 text-xs text-destructive hover:opacity-80"
      >
        <Trash2 className="size-3.5" />
        Delete account
      </button>
    );
  }
  const canDelete = typed.trim().toUpperCase() === "DELETE";
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-4 space-y-3">
      <p className="text-[13px] font-medium text-foreground">Delete your account?</p>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        We'll disconnect every linked bank at Plaid, delete your wallet, cards, alerts, merchant
        memory, and account. This can't be undone.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder='Type "DELETE" to confirm'
        className="w-full h-10 rounded-xl border border-border bg-white px-3 text-[13px]"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
          disabled={busy}
          className="h-9 px-3 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !canDelete}
          onClick={async () => {
            setBusy(true);
            try {
              await deleteAccount();
              await supabase.auth.signOut();
              toast.success("Account deleted.");
              onDeleted();
            } catch (e) {
              console.error(e);
              toast.error("Couldn't delete account.");
              setBusy(false);
            }
          }}
          className="h-9 px-4 rounded-full bg-destructive text-destructive-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
