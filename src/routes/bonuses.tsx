import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CardCatalog, UserCard, UserSignupBonus } from "@/lib/types";
import { dollars, pointsFmt } from "@/lib/format";
import { BottomNav } from "@/components/bottom-nav";
import { Plus, Trash2, Trophy, X, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bonuses")({
  component: BonusesPage,
});

type Data = {
  bonuses: UserSignupBonus[];
  userCards: UserCard[];
  catalog: Record<string, CardCatalog>;
};

function BonusesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<UserSignupBonus | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const load = async () => {
    const [ub, uc, cc] = await Promise.all([
      supabase.from("user_signup_bonuses").select("*").order("deadline", { ascending: true }),
      supabase.from("user_cards").select("*"),
      supabase.from("cards_catalog").select("*"),
    ]);
    const catalog: Record<string, CardCatalog> = {};
    (cc.data ?? []).forEach((c: any) => (catalog[c.id] = c));
    setData({
      bonuses: (ub.data ?? []) as UserSignupBonus[],
      userCards: (uc.data ?? []) as UserCard[],
      catalog,
    });
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const { active, completed, expired } = useMemo(() => {
    const now = Date.now();
    const a: UserSignupBonus[] = [];
    const c: UserSignupBonus[] = [];
    const e: UserSignupBonus[] = [];
    (data?.bonuses ?? []).forEach((b) => {
      const done = b.spend_so_far >= b.spend_required;
      const past = new Date(b.deadline).getTime() < now;
      if (done) c.push(b);
      else if (past) e.push(b);
      else a.push(b);
    });
    return { active: a, completed: c, expired: e };
  }, [data]);

  const totalRemaining = active.reduce(
    (sum, b) => sum + Math.max(0, b.spend_required - b.spend_so_far),
    0,
  );
  const totalPendingPoints = active.reduce((sum, b) => sum + b.bonus_points, 0);

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-foreground">Signup bonuses</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </header>

      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Remaining spend" value={dollars(totalRemaining * 100)} />
          <Stat
            label="Pending points"
            value={pointsFmt(totalPendingPoints)}
            accent={totalPendingPoints > 0}
          />
        </div>

        {!data ? null : data.bonuses.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <div className="space-y-7">
            {active.length > 0 && (
              <Section title="In progress">
                {active.map((b) => (
                  <BonusCard
                    key={b.id}
                    bonus={b}
                    data={data}
                    onEdit={() => setEditing(b)}
                    onChanged={load}
                  />
                ))}
              </Section>
            )}
            {completed.length > 0 && (
              <Section title="Completed">
                {completed.map((b) => (
                  <BonusCard
                    key={b.id}
                    bonus={b}
                    data={data}
                    completed
                    onEdit={() => setEditing(b)}
                    onChanged={load}
                  />
                ))}
              </Section>
            )}
            {expired.length > 0 && (
              <Section title="Missed">
                {expired.map((b) => (
                  <BonusCard
                    key={b.id}
                    bonus={b}
                    data={data}
                    expired
                    onEdit={() => setEditing(b)}
                    onChanged={load}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </main>

      {(showAdd || editing) && data && (
        <BonusSheet
          data={data}
          existing={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setShowAdd(false);
            setEditing(null);
            await load();
          }}
        />
      )}

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-surface px-4 py-3 ${
        accent ? "border-primary/40" : "border-border"
      }`}
    >
      <p
        className={`text-xl font-semibold tabular-nums ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-2 px-1">
        {title}
      </h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400_000);
}

function BonusCard({
  bonus,
  data,
  completed,
  expired,
  onEdit,
  onChanged,
}: {
  bonus: UserSignupBonus;
  data: Data;
  completed?: boolean;
  expired?: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const uc = data.userCards.find((c) => c.id === bonus.user_card_id);
  const card = uc ? data.catalog[uc.card_catalog_id] : null;
  const cardLabel = uc?.nickname ?? (card ? `${card.issuer} ${card.name}` : "Unknown card");
  const remaining = Math.max(0, bonus.spend_required - bonus.spend_so_far);
  const pct = Math.min(100, (bonus.spend_so_far / bonus.spend_required) * 100);
  const days = daysUntil(bonus.deadline);
  const urgent = !completed && !expired && days <= 30;

  const remove = async () => {
    const { error } = await supabase.from("user_signup_bonuses").delete().eq("id", bonus.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      onChanged();
    }
  };

  const dailyRequired = !completed && !expired && days > 0 ? remaining / days : 0;

  return (
    <li
      className={`rounded-2xl border bg-surface p-4 ${
        completed
          ? "border-success/40"
          : expired
            ? "border-border opacity-70"
            : urgent
              ? "border-destructive/40"
              : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{cardLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pointsFmt(bonus.bonus_points)} pts for {dollars(bonus.spend_required * 100)} spend
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-1.5">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={remove} className="text-muted-foreground hover:text-destructive p-1.5">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {dollars(bonus.spend_so_far * 100)} of {dollars(bonus.spend_required * 100)}
          </span>
          <span
            className={`text-xs font-medium tabular-nums ${
              completed ? "text-success" : "text-foreground"
            }`}
          >
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              completed ? "bg-success" : urgent ? "bg-destructive" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        {completed ? (
          <span className="text-success font-medium">Earned — claim your points</span>
        ) : expired ? (
          <span className="text-muted-foreground">Deadline passed</span>
        ) : (
          <>
            <span className="text-muted-foreground">
              {dollars(remaining * 100)} left ·{" "}
              <span className={urgent ? "text-destructive font-medium" : ""}>
                {days === 0 ? "due today" : days === 1 ? "1 day left" : `${days} days left`}
              </span>
            </span>
            {dailyRequired > 0 && (
              <span className="text-muted-foreground tabular-nums">
                ~{dollars(Math.round(dailyRequired * 100))}/day
              </span>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
      <Trophy className="size-5 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">No bonuses tracked.</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Add a signup bonus to see your spend progress and deadline at a glance.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90"
      >
        <Plus className="size-3.5" />
        Add bonus
      </button>
    </div>
  );
}

function BonusSheet({
  data,
  existing,
  onClose,
  onSaved,
}: {
  data: Data;
  existing: UserSignupBonus | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userCardId, setUserCardId] = useState(
    existing?.user_card_id ?? data.userCards[0]?.id ?? "",
  );
  const [bonusPoints, setBonusPoints] = useState(existing ? String(existing.bonus_points) : "");
  const [spendRequired, setSpendRequired] = useState(
    existing ? String(existing.spend_required) : "",
  );
  const [spendSoFar, setSpendSoFar] = useState(existing ? String(existing.spend_so_far) : "0");
  const [deadline, setDeadline] = useState(existing?.deadline ?? "");
  const [saving, setSaving] = useState(false);

  const noCards = data.userCards.length === 0;

  const submit = async () => {
    if (!userCardId) return toast.error("Pick a card");
    const bp = parseInt(bonusPoints);
    const sr = parseInt(spendRequired);
    const ssf = parseInt(spendSoFar) || 0;
    if (!bp || bp <= 0) return toast.error("Bonus points required");
    if (!sr || sr <= 0) return toast.error("Spend required");
    if (!deadline) return toast.error("Pick a deadline");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const payload = {
      user_id: userRes.user!.id,
      user_card_id: userCardId,
      bonus_points: bp,
      spend_required: sr,
      spend_so_far: ssf,
      deadline,
    };
    const { error } = existing
      ? await supabase.from("user_signup_bonuses").update(payload).eq("id", existing.id)
      : await supabase.from("user_signup_bonuses").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(existing ? "Updated" : "Added");
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/30">
      <div className="w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background px-6 pt-5 pb-3 flex items-center justify-between border-b border-border">
          <h3 className="text-base font-semibold">
            {existing ? "Edit bonus" : "Add signup bonus"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {noCards ? (
            <p className="text-sm text-muted-foreground">Add a card first.</p>
          ) : (
            <>
              <Field label="Card">
                <select
                  value={userCardId}
                  onChange={(e) => setUserCardId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                >
                  {data.userCards.map((uc) => {
                    const c = data.catalog[uc.card_catalog_id];
                    const label = uc.nickname ?? (c ? `${c.issuer} ${c.name}` : uc.card_catalog_id);
                    return (
                      <option key={uc.id} value={uc.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Bonus points">
                  <input
                    inputMode="numeric"
                    value={bonusPoints}
                    onChange={(e) => setBonusPoints(e.target.value)}
                    placeholder="80000"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
                <Field label="Deadline">
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Spend required ($)">
                  <input
                    inputMode="numeric"
                    value={spendRequired}
                    onChange={(e) => setSpendRequired(e.target.value)}
                    placeholder="4000"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
                <Field label="Spent so far ($)">
                  <input
                    inputMode="numeric"
                    value={spendSoFar}
                    onChange={(e) => setSpendSoFar(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className="w-full rounded-xl bg-foreground text-background py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : existing ? "Save changes" : "Add bonus"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
