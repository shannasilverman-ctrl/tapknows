import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/wordmark";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { SaveWalletSheet } from "@/components/save-wallet-sheet";
import { PhotoImportSheet } from "@/components/photo-import-sheet";
import { TapAppShell } from "@/components/tap-primitives";
import { WalletStack, type StackCard } from "@/components/wallet-stack";
import { CARD_CATALOG, CATALOG_BY_ID, type CatalogCard } from "@/lib/cardCatalog";
import { POINT_VALUATIONS } from "@/lib/pointValuations";
import { recommend, type EngineCard } from "@/lib/recommendationEngine";
import { addGuestCard, getGuestWallet, removeGuestCard, setGuestPrefs } from "@/lib/guestWallet";
import { needsHomeScreenInstall } from "@/lib/pwa";
import {
  Search,
  Check,
  ArrowRight,
  ArrowLeft,
  Share,
  ChevronDown,
  Camera,
  Zap,
} from "lucide-react";
import {
  PrioritySliders,
  PRESETS,
  BALANCED_PRIORITIES,
  detectPreset,
  type Priorities,
} from "@/components/priority-sliders";

// Curated quick-add chips: the most common US rewards cards. Tapping adds the
// card to the wallet with zero typing. Ids must match src/lib/cardCatalog.ts.
const QUICK_ADD_CHIPS: { id: string; label: string }[] = [
  { id: "amex_gold", label: "Amex Gold" },
  { id: "amex_platinum", label: "Amex Platinum" },
  { id: "chase_csp", label: "Chase Sapphire Preferred" },
  { id: "chase_csr", label: "Chase Sapphire Reserve" },
  { id: "chase_freedom_unlimited", label: "Chase Freedom Unlimited" },
  { id: "citi_double_cash", label: "Citi Double Cash" },
  { id: "amex_blue_cash_preferred", label: "Amex Blue Cash Preferred" },
  { id: "capone_venture_x", label: "Capital One Venture X" },
];

const SAMPLE_TRANSACTIONS: { key: string; label: string; amountCents: number; category: string }[] =
  [
    { key: "dining", label: "$60 at a restaurant", amountCents: 6000, category: "dining" },
    {
      key: "groceries",
      label: "$120 at the grocery store",
      amountCents: 12000,
      category: "groceries",
    },
  ];

function buildEngineWallet(catalogIds: string[]): EngineCard[] {
  return catalogIds
    .map((id) => {
      const c = CATALOG_BY_ID[id];
      if (!c) return null;
      return {
        id: `catalog_${id}`,
        card_catalog_id: id,
        nickname: null,
        issuer: c.issuer,
        name: c.name,
        points_program_id: c.points_program_id,
        foreign_tx_fee_pct: Number(c.foreign_tx_fee_pct),
        earn_rules: c.earn_rules ?? [],
      } as EngineCard;
    })
    .filter((c): c is EngineCard => !!c);
}

function buildValuations(): Record<string, number> {
  const v: Record<string, number> = { cashback: 0.01 };
  for (const [k, val] of Object.entries(POINT_VALUATIONS)) v[k] = val.cpp;
  return v;
}

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

type Step = 1 | 2 | 3;

const DEFAULT_PRIORITIES: Priorities = BALANCED_PRIORITIES;

const PRESET_ROWS: { key: keyof typeof PRESETS; description: string }[] = [
  { key: "points_max", description: "Chase every point." },
  { key: "balanced", description: "A sensible middle. Recommended." },
  { key: "credit_protector", description: "Guard your score first." },
];

function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [authForPlaidOpen, setAuthForPlaidOpen] = useState(false);
  const [photoImportFile, setPhotoImportFile] = useState<File | null>(null);
  const [photoImportOpen, setPhotoImportOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [prio, setPrio] = useState<Priorities>(DEFAULT_PRIORITIES);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  useEffect(() => setNeedsInstall(needsHomeScreenInstall()), []);

  // Step 3 state — "See it work" sample transaction against the real engine.
  const [sampleKey, setSampleKey] = useState<string | null>(null);
  const sampleResult = useMemo(() => {
    if (!sampleKey) return null;
    const s = SAMPLE_TRANSACTIONS.find((x) => x.key === sampleKey);
    if (!s) return null;
    const wallet = buildEngineWallet(Array.from(selectedCatalogIds));
    if (wallet.length === 0) return { winner: null, sample: s };
    const out = recommend({
      amountCents: s.amountCents,
      category: s.category,
      wallet,
      offers: [],
      valuations: buildValuations(),
    });
    return { winner: out.winner, sample: s };
  }, [sampleKey, selectedCatalogIds]);
  const sampleStackCards = useMemo<StackCard[]>(() => {
    const winningId = sampleResult?.winner?.legs[0]?.userCardId;
    return Array.from(selectedCatalogIds).flatMap((catalogId) => {
      const card = CATALOG_BY_ID[catalogId];
      if (!card) return [];
      const id = `catalog_${catalogId}`;
      return [
        {
          id,
          issuer: card.issuer,
          name: card.name,
          winner: id === winningId,
        } satisfies StackCard,
      ];
    });
  }, [sampleResult, selectedCatalogIds]);

  // Load current wallet on mount so returning users pick up where they left off
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user) {
        const { data } = await supabase
          .from("user_cards")
          .select("card_catalog_id")
          .eq("user_id", user.id);
        if (!cancelled && data) {
          setSelectedCatalogIds(new Set(data.map((r) => r.card_catalog_id)));
        }
      } else {
        const g = getGuestWallet();
        setSelectedCatalogIds(new Set(g.cards.map((c) => c.card_catalog_id)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const results: CatalogCard[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CARD_CATALOG.slice(0, 12);
    return CARD_CATALOG.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.issuer.toLowerCase().includes(q) ||
        `${c.issuer} ${c.name}`.toLowerCase().includes(q),
    ).slice(0, 20);
  }, [query]);

  const toggleCard = async (c: CatalogCard) => {
    const next = new Set(selectedCatalogIds);
    if (next.has(c.id)) {
      next.delete(c.id);
      if (user) {
        await supabase
          .from("user_cards")
          .delete()
          .eq("user_id", user.id)
          .eq("card_catalog_id", c.id);
      } else {
        const g = getGuestWallet();
        const guestCard = g.cards.find((x) => x.card_catalog_id === c.id);
        if (guestCard) removeGuestCard(guestCard.id);
      }
    } else {
      next.add(c.id);
      if (user) {
        await supabase.from("user_cards").insert({ user_id: user.id, card_catalog_id: c.id });
      } else {
        addGuestCard(c.id);
      }
    }
    setSelectedCatalogIds(next);
  };

  // Batch-add from photo import. De-dupes against currently owned set.
  const handlePhotoImportAdd = async (cards: CatalogCard[]): Promise<number> => {
    const next = new Set(selectedCatalogIds);
    let ok = 0;
    for (const c of cards) {
      if (next.has(c.id)) continue;
      try {
        if (user) {
          const { error } = await supabase
            .from("user_cards")
            .insert({ user_id: user.id, card_catalog_id: c.id });
          if (error) throw error;
        } else {
          addGuestCard(c.id);
        }
        next.add(c.id);
        ok += 1;
      } catch {
        /* keep going */
      }
    }
    setSelectedCatalogIds(next);
    return ok;
  };

  const savePriorities = async (values: Priorities = prio) => {
    // v1: priorities are stored locally for both guests and signed-in users.
    // They influence UI hints; DB persistence can be added later.
    try {
      window.localStorage.setItem("tap.priorities", JSON.stringify(values));
      const preset = detectPreset(values);
      if (preset) window.localStorage.setItem("tap.priorityPreset", preset);
    } catch {}
    if (!user) setGuestPrefs({});
  };

  const finish = () => {
    navigate({ to: "/home", search: { firstRun: 1 } });
  };

  const skip = async () => {
    // Apply the Balanced preset silently so recommendations still work.
    await savePriorities(BALANCED_PRIORITIES);
    finish();
  };

  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <TapAppShell className="tap-onboarding">
      <header className="tap-onboarding-header px-5 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={() => {
            if (step === 1) navigate({ to: "/" });
            else setStep((s) => (s - 1) as Step);
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <Wordmark size="sm" />
        <button
          onClick={skip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>
      </header>

      {/* Progress */}
      <div className="tap-onboarding-progress px-5">
        <div className="h-1 bg-secondary rounded-full overflow-hidden max-w-md mx-auto">
          <div
            className="h-full bg-foreground transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] cs-microlabel text-muted-foreground text-center">
          Step {step} of 3
        </p>
      </div>

      <main className="flex-1 px-5 pb-24 max-w-md w-full mx-auto pt-6">
        {step === 1 && (
          <div className="cs-fade-up">
            <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">
              Build your wallet.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Add the cards you carry. We never store card numbers — only which products you own.
            </p>

            <div className="mt-5">
              <PlaidLinkButton
                onNeedAuth={() => setAuthForPlaidOpen(true)}
                onComplete={() => {
                  // Reload wallet after Plaid confirmation adds cards
                  supabase
                    .from("user_cards")
                    .select("card_catalog_id")
                    .then(({ data }) => {
                      if (data) setSelectedCatalogIds(new Set(data.map((r) => r.card_catalog_id)));
                    });
                }}
              />

              {/* Quick-add chips — one-tap add for the most common US rewards cards. */}
              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Quick add
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_ADD_CHIPS.map((chip) => {
                    const cat = CATALOG_BY_ID[chip.id];
                    if (!cat) return null;
                    const on = selectedCatalogIds.has(chip.id);
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => toggleCard(cat)}
                        className="cs-quick-add-chip"
                        data-selected={on ? "true" : "false"}
                        aria-pressed={on}
                      >
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Photo quick load — second in hierarchy, above manual search. */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-white text-[14px] font-medium text-foreground hover:border-primary/40 transition-colors"
              >
                <Camera className="size-4" strokeWidth={2} />
                Add cards from a photo
              </button>
              <p className="mt-2 text-center text-[12px] text-muted-foreground leading-snug">
                Snap your cards or upload a screenshot of your wallet. Photos are read once and
                never stored.
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) {
                    setPhotoImportFile(f);
                    setPhotoImportOpen(true);
                  }
                }}
                aria-label="Choose a photo or screenshot of your cards"
              />

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Or add manually
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards — Sapphire, Gold, Freedom…"
                className="w-full h-12 rounded-2xl border border-border bg-background pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>

            <p className="mt-4 text-[10px] cs-microlabel text-muted-foreground">
              {selectedCatalogIds.size} added
            </p>
            <div className="mt-2 space-y-2">
              {results.map((c) => {
                const on = selectedCatalogIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCard(c)}
                    className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
                      on
                        ? "border-foreground bg-secondary/60"
                        : "border-border bg-background hover:border-border-strong"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {c.issuer}
                      </p>
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    </div>
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full border transition-colors shrink-0 ${
                        on
                          ? "bg-foreground border-foreground text-background"
                          : "border-border-strong text-transparent"
                      }`}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="cs-fade-up">
            <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">
              Set your priorities.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              TAP weights recommendations toward what matters to you.
            </p>

            <div className="mt-6 space-y-2" role="radiogroup" aria-label="Priority preset">
              {PRESET_ROWS.map(({ key, description }) => {
                const preset = PRESETS[key];
                const active = detectPreset(prio) === key;
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPrio(preset.values)}
                    className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition-all ${
                      active
                        ? "border-foreground bg-secondary/60"
                        : "border-border bg-background hover:border-border-strong"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-foreground truncate">
                        {preset.label}
                        {preset.recommended && (
                          <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                            Recommended
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                        {description}
                      </p>
                    </div>
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full border transition-colors shrink-0 ${
                        active
                          ? "bg-foreground border-foreground text-background"
                          : "border-border-strong text-transparent"
                      }`}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="text-[13px] text-muted-foreground">Fine-tune priorities</span>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {advancedOpen && (
                <div className="mt-5 cs-fade-up">
                  <PrioritySliders value={prio} onChange={setPrio} />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="cs-fade-up">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Zap className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-3xl sm:text-4xl tracking-tight text-foreground">
              See it work.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tap an example. TAP will pick your best card using the cards you just added.
            </p>

            <div className="mt-6 space-y-2">
              {SAMPLE_TRANSACTIONS.map((s) => {
                const active = sampleKey === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSampleKey(s.key)}
                    className={`w-full flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all ${
                      active
                        ? "border-foreground bg-secondary/60"
                        : "border-border bg-background hover:border-border-strong"
                    }`}
                  >
                    <span className="text-[15px] font-medium text-foreground">{s.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>

            {sampleResult && (
              <div className="mt-6 cs-fade-up">
                {sampleResult.winner ? (
                  <div className="tap-onboarding-result">
                    <div>
                      <p>Use {sampleResult.winner.legs[0]?.cardLabel}.</p>
                      <span>{sampleResult.sample.label}</span>
                    </div>
                    <WalletStack
                      cards={sampleStackCards}
                      mode="recommendation"
                      raisedCardId={sampleResult.winner.legs[0]?.userCardId}
                      pocket
                      pocketLabel="The same recommendation you’ll see in TAP"
                    />
                    <p>{sampleResult.winner.headline}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-secondary/40 p-5">
                    <p className="text-sm text-foreground">
                      Add a rewards card like Amex Gold to see TAP pick your best card.
                    </p>
                  </div>
                )}
              </div>
            )}

            {needsInstall && (
              <div className="mt-6 rounded-2xl border border-border bg-white p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <Share className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Add TAP to your Home Screen
                    </p>
                    <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
                      On iPhone, tap the Share button in Safari, then Add to Home Screen. Open TAP
                      from the icon so it can nudge you later.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sticky footer with primary CTA */}
      <footer className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          {step === 1 && (
            <>
              <button
                onClick={() => setStep(2)}
                disabled={selectedCatalogIds.size === 0}
                className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
              {selectedCatalogIds.size === 0 && (
                <p className="mt-2 text-center text-[12px] text-muted-foreground">
                  Add at least one card to continue.
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <button
              onClick={async () => {
                await savePriorities();
                setStep(3);
              }}
              className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Continue
              <ArrowRight className="size-4" />
            </button>
          )}
          {step === 3 && (
            <button
              onClick={finish}
              className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Start using TAP
              <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </footer>
      <SaveWalletSheet open={authForPlaidOpen} onClose={() => setAuthForPlaidOpen(false)} />
      <PhotoImportSheet
        open={photoImportOpen}
        onClose={() => setPhotoImportOpen(false)}
        initialFile={photoImportFile}
        existingCatalogIds={selectedCatalogIds}
        onAddCards={handlePhotoImportAdd}
        onUnmatchedSearch={(name) => {
          setQuery(name);
          window.setTimeout(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 300);
        }}
        context="onboarding"
      />
    </TapAppShell>
  );
}
