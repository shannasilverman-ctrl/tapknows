import { useCallback, useMemo } from "react";

export type Priorities = {
  points: number;
  score: number;
  protections: number;
};

export const PRESETS: Record<
  "points_max" | "balanced" | "credit_protector",
  { label: string; values: Priorities; recommended?: boolean }
> = {
  points_max: {
    label: "Points maximizer",
    values: { points: 85, score: 25, protections: 30 },
  },
  balanced: {
    label: "Balanced",
    values: { points: 60, score: 50, protections: 45 },
    recommended: true,
  },
  credit_protector: {
    label: "Credit protector",
    values: { points: 35, score: 85, protections: 50 },
  },
};

export const BALANCED_PRIORITIES: Priorities = PRESETS.balanced.values;

const RECOMMENDED: Record<keyof Priorities, number> = {
  points: BALANCED_PRIORITIES.points,
  score: BALANCED_PRIORITIES.score,
  protections: BALANCED_PRIORITIES.protections,
};

const TICKS = [0, 25, 50, 75, 100] as const;

export function detectPreset(p: Priorities): keyof typeof PRESETS | "custom" {
  for (const key of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const v = PRESETS[key].values;
    if (v.points === p.points && v.score === p.score && v.protections === p.protections) {
      return key;
    }
  }
  return "custom";
}

export function weightedTowardLine(p: Priorities): string {
  const entries: [keyof Priorities, number, string][] = [
    ["points", p.points, "points"],
    ["score", p.score, "credit score"],
    ["protections", p.protections, "protections"],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  if (top[1] - second[1] < 10) {
    return `Weighted evenly across ${top[2]} and ${second[2]}.`;
  }
  return `Weighted toward ${top[2]}.`;
}

export function PrioritySliders({
  value,
  onChange,
}: {
  value: Priorities;
  onChange: (next: Priorities) => void;
}) {
  const selected = detectPreset(value);

  const setPreset = useCallback(
    (key: keyof typeof PRESETS) => {
      onChange(PRESETS[key].values);
    },
    [onChange],
  );

  const line = useMemo(() => weightedTowardLine(value), [value]);

  return (
    <div>
      {/* Preset chips */}
      <div role="radiogroup" aria-label="Priority preset" className="flex gap-2 flex-wrap">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => {
          const preset = PRESETS[key];
          const active = selected === key;
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              onClick={() => setPreset(key)}
              className={`relative inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium transition-colors border ${
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-foreground border-border hover:border-border-strong"
              }`}
            >
              {preset.label}
              {preset.recommended && (
                <span
                  className={`text-[9px] uppercase tracking-[0.1em] ${
                    active ? "text-background/70" : "text-muted-foreground"
                  }`}
                >
                  Recommended
                </span>
              )}
            </button>
          );
        })}
        {selected === "custom" && (
          <span className="inline-flex items-center h-9 px-2 text-[11px] text-muted-foreground">
            Custom
          </span>
        )}
      </div>

      {/* Sliders */}
      <div className="mt-6 space-y-7">
        <PrioritySlider
          label="Maximize points"
          sub="Chase the biggest earn on every charge."
          value={value.points}
          recommended={RECOMMENDED.points}
          onChange={(v) => onChange({ ...value, points: v })}
        />
        <PrioritySlider
          label="Protect credit score"
          sub="Keep utilization low. Warn before high charges."
          value={value.score}
          recommended={RECOMMENDED.score}
          onChange={(v) => onChange({ ...value, score: v })}
        />
        <PrioritySlider
          label="Prioritize protections"
          sub="Favor cards with strong purchase and travel coverage."
          value={value.protections}
          recommended={RECOMMENDED.protections}
          onChange={(v) => onChange({ ...value, protections: v })}
        />
      </div>

      {/* Weighted line */}
      <p aria-live="polite" className="mt-6 text-[12px] text-muted-foreground">
        {line}
      </p>
    </div>
  );
}

function PrioritySlider({
  label,
  sub,
  value,
  recommended,
  onChange,
}: {
  label: string;
  sub: string;
  value: number;
  recommended: number;
  onChange: (v: number) => void;
}) {
  const onRecommended = value === recommended;

  // Snap-to-detent within 4 points. Detents = ticks ∪ {recommended}.
  const snap = (raw: number): number => {
    const candidates = [...TICKS, recommended];
    let best = raw;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.abs(raw - c);
      if (d <= 4 && d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="text-right shrink-0">
          <p className="cs-money text-xs text-foreground">{value}</p>
          {onRecommended && (
            <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
              Recommended
            </p>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>

      <div className="cs-priority-slider mt-4 relative">
        {/* Tick marks (visual only, non-interactive) */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none h-4">
          {TICKS.map((t) => {
            const isRecommendedTick = t === recommended;
            return (
              <span
                key={`t-${t}`}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ${
                  isRecommendedTick ? "size-2 bg-foreground" : "size-1 bg-border-strong"
                }`}
                style={{ left: `${t}%` }}
                aria-hidden
              />
            );
          })}
          {/* Recommended detent (if not on a standard tick) */}
          {!TICKS.includes(recommended as (typeof TICKS)[number]) && (
            <span
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2 rounded-full bg-foreground"
              style={{ left: `${recommended}%` }}
              aria-hidden
            />
          )}
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(snap(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange(Math.min(100, value + 5));
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.max(0, value - 5));
            }
          }}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          className="relative w-full accent-foreground"
        />

        {/* Recommended value label */}
        <div className="relative h-4 mt-1">
          <span
            className="absolute -translate-x-1/2 text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
            style={{ left: `${recommended}%` }}
            aria-hidden
          >
            {recommended}
          </span>
        </div>
      </div>
    </div>
  );
}
