// PF-1..PF-4 — the shared press-feedback layer.
//
// TAP is an app about tapping, and before this layer 6 of 213 interactive
// elements answered a press at all. These assert the layer exists, is shared
// rather than per-element, costs no layout, and degrades to an instant state
// change under reduced motion rather than to nothing.
//
// Asserted against src/styles.css read at run time, because the claim is about
// what actually ships to the browser, not about what a component intends.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** The press layer, delimited so these assertions cannot accidentally read the whole sheet. */
function pressLayer(): string {
  const start = CSS.indexOf("/* === press feedback layer === */");
  const end = CSS.indexOf("/* === end press feedback layer === */");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return CSS.slice(start, end);
}

describe("PF-1 one shared rule covers every interactive element", () => {
  it("names every interactive selector in a single :active rule", () => {
    const layer = pressLayer();
    for (const sel of [
      "button",
      "a[href]",
      '[role="button"]',
      '[role="switch"]',
      '[role="tab"]',
      "summary",
    ]) {
      expect(layer).toContain(sel);
    }
    expect(layer).toContain(":active");
  });

  it("is opt-out-able, so a surface that must not scale can say so", () => {
    expect(pressLayer()).toContain("data-no-press");
  });
});

describe("PF-2 press costs no layout", () => {
  it("animates transform only — no layout-triggering property in the layer", () => {
    const layer = pressLayer();
    // width/height/margin/padding/top/left in a rule that runs on every press
    // would cause layout on the interaction path.
    for (const prop of [
      "\n    width:",
      "\n    height:",
      "\n    margin:",
      "\n    padding:",
      "\n    top:",
      "\n    left:",
    ]) {
      expect(layer).not.toContain(prop);
    }
    expect(layer).toMatch(/transform:\s*scale\(/);
  });

  it("scales within the 0.96–0.97 range the brief specifies", () => {
    const scales = [...pressLayer().matchAll(/scale\((0\.\d+)\)/g)].map((m) => Number(m[1]));
    expect(scales.length).toBeGreaterThan(0);
    for (const s of scales) {
      expect(s).toBeGreaterThanOrEqual(0.96);
      expect(s).toBeLessThanOrEqual(0.97);
    }
  });
});

describe("PF-3 reduced motion gets feedback, not silence", () => {
  it("replaces the scale with an instant state change rather than removing it", () => {
    const layer = pressLayer();
    const rm = layer.slice(layer.indexOf("prefers-reduced-motion"));
    expect(rm.length).toBeGreaterThan(0);
    // The tell for "removed the feedback": a reduced-motion block that only
    // resets transform and offers nothing in its place.
    expect(rm).toMatch(/opacity:/);
  });
});

describe("PF-4 the layer replaces per-element drift", () => {
  it("no per-element active:scale utilities survive in components", () => {
    // Before this layer, six elements each declared their own value — two at
    // 0.98 and four at 0.96 — which is exactly the drift a shared layer exists
    // to prevent. If this fails, a component re-introduced its own press.
    const out = execSync("grep -rl 'active:scale' src --include='*.tsx' || true", {
      encoding: "utf8",
    }).trim();
    expect(out).toBe("");
  });
});
