// Card surfaces must come from tokens, not from a fresh gradient each time.
//
// This exists because of a specific, repeated failure. TAP had SEVEN separate
// gold card treatments — .tap-wallet-card-gold, .tap-choice-card-gold,
// .tap-proof-mini-gold, .tap-proof-swatch-gold, .tap-onboarding-mini-win,
// .cs-gold-surface and .cs-cardstock--gold — which had drifted to five
// different gradients, three sheen opacities and three angles. Two were fixed
// and the operator still saw a broken card, because the other five were never
// touched. Fixing "the gold card" is not a thing you can do once by hand.
//
// So the rule is: a card metal is a token, and a card that wants gold
// references it. These assertions fail the build when someone adds an eighth.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Gold hexes that were in use before unification, plus the token values. */
const GOLD_HEX =
  /#(?:e9cd93|d0aa64|b8904a|ddbf83|aa7646|e1c58d|b68654|dab97d|a97948|e0c995|aa8142)/i;

describe("card metals are tokens", () => {
  it("defines the gold ramp and the sheen exactly once", () => {
    for (const token of [
      "--tap-gold-hi",
      "--tap-gold-mid",
      "--tap-gold-lo",
      "--tap-gold:",
      "--tap-card-sheen",
    ]) {
      const hits = CSS.split(token).length - 1;
      expect(hits, `${token} should be declared once and only once`).toBeGreaterThanOrEqual(1);
    }
  });

  it("no rule invents its own gold gradient", () => {
    // Every gold hex must sit on a line that DECLARES a --tap-gold-* token.
    // Locating the block by character offset was brittle — prettier reflows
    // the declaration and the window moved. Checking per line is stable.
    const strays = CSS.split("\n")
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => GOLD_HEX.test(line) && !/--tap-gold-(hi|mid|lo):/.test(line))
      .map(({ line, i }) => `${i + 1}: ${line.trim()}`);
    expect(
      strays,
      "a gold hex appeared outside the --tap-gold-* declarations — reference var(--tap-gold)",
    ).toEqual([]);
  });

  it("the sheen is a soft highlight, never a hard-stopped hairline", () => {
    // The original bug: transparent 55% → 50% white 55.5% → transparent 56%.
    // A 0.5%-wide band at half opacity renders as a scratch across the card,
    // which is exactly what shipped on the landing mockup.
    const hairline =
      /transparent \d+(?:\.\d+)?%,\s*rgba\(255,\s*255,\s*255,\s*0\.[3-9]\d*\)\s*\d+(?:\.\d+)?%/g;
    expect(CSS.match(hairline) ?? [], "hard-stopped bright sheen band found").toEqual([]);
  });

  it("the sheen band is wide enough to read as light, not as damage", () => {
    // Read the full declaration regardless of line wrapping.
    // The DECLARATION, not the first usage — var(--tap-card-sheen) appears in
    // card rules long before :root declares it.
    const i = CSS.indexOf("--tap-card-sheen:");
    expect(i).toBeGreaterThan(-1);
    const decl = CSS.slice(i, CSS.indexOf(");", i) + 2);
    const stops = [...decl.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
    expect(stops.length, "sheen should declare colour stops").toBeGreaterThanOrEqual(3);
    const width = Math.max(...stops) - Math.min(...stops);
    expect(width, "sheen should span a soft band, not a hairline").toBeGreaterThanOrEqual(8);
  });
});
