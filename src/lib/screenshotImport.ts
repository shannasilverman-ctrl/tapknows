// Fuzzy-match extracted card names against the 25-card catalog.
// Kept as a pure module so it's trivially testable and reusable.

import { CARD_CATALOG, type CatalogCard } from "@/lib/cardCatalog";

export type MatchResult = {
  input: string; // original name text from the model
  candidates: CatalogCard[]; // 1 = confident, >1 = ambiguous (e.g. "Chase Sapphire")
};

export type MatchReport = {
  matched: MatchResult[];
  unmatched: string[];
};

// Normalize for comparison — strip issuer noise, punctuation, common words
// like "card" / "visa" / "mastercard" that don't help distinguish products.
const STOPWORDS = new Set([
  "card",
  "credit",
  "visa",
  "mastercard",
  "amex",
  "american",
  "express",
  "the",
  "and",
  "a",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/…/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
}

// Score how well an input name matches a catalog card. Higher = better.
// The scoring rewards:
//   - each token from the input that appears in the catalog card's full text
//   - a prefix bonus (Apple Pay truncates aggressively — "Chase Freedom Unli"
//     should still match "Freedom Unlimited")
//   - a small penalty when the input has tokens the card doesn't (limits
//     wrong-issuer matches).
function score(input: string, card: CatalogCard): number {
  const inTokens = tokens(input);
  if (inTokens.length === 0) return 0;
  const cardText = normalize(`${card.issuer} ${card.name}`);
  const cardTokens = new Set(tokens(cardText));

  let matched = 0;
  let prefixHits = 0;
  for (const t of inTokens) {
    if (cardTokens.has(t)) {
      matched += 1;
      continue;
    }
    // Prefix match against any card token (>=3 chars) — handles truncations
    // like "unli" → "unlimited", "sapph" → "sapphire".
    if (t.length >= 3) {
      for (const ct of cardTokens) {
        if (ct.length >= t.length && ct.startsWith(t)) {
          prefixHits += 1;
          break;
        }
      }
    }
  }
  const covered = matched + 0.6 * prefixHits;
  if (covered === 0) return 0;
  const coverage = covered / inTokens.length;
  // Prefer cards where most of the input tokens landed. A single overlapping
  // token like "chase" alone is not enough to declare a match.
  return coverage;
}

const CONFIDENT = 0.7; // most tokens matched
const TIE = 0.08; // treat as ambiguous if within this of the top score

export function matchNames(names: string[]): MatchReport {
  const matched: MatchResult[] = [];
  const unmatched: string[] = [];

  for (const raw of names) {
    const cleaned = raw.replace(/…/g, "").trim();
    if (!cleaned) continue;

    const scored = CARD_CATALOG.map((c) => ({ card: c, s: score(cleaned, c) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);

    if (scored.length === 0 || scored[0].s < CONFIDENT) {
      unmatched.push(cleaned);
      continue;
    }

    const top = scored[0].s;
    const candidates = scored.filter((r) => r.s >= top - TIE).map((r) => r.card);

    matched.push({ input: cleaned, candidates });
  }

  return { matched, unmatched };
}

// Downscale an image File to a max dimension and return a JPEG data URL.
// Runs entirely in the browser — no upload of the original.
export async function downscaleImage(file: File, maxEdge = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
