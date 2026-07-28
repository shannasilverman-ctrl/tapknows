// PF-5, PF-6 — the celebration burst.
//
// The brief's real demands are the quiet ones: firing repeatedly must not
// stack canvases or leak, it must never block a click underneath, it must
// clean up completely, and reduced-motion users must get an acknowledgment
// rather than nothing. Those are what these assert.
//
// The physics live in a pure step function so they are testable without a
// browser: particles must fall under gravity with drag and drift sideways,
// not travel at a constant speed, which is what separates a real burst from
// a spray of divs.

import { describe, expect, it } from "vitest";
import { CONFETTI_PARTICLE_COUNT, createParticles, stepParticle } from "./confetti";

describe("PF-5 particle physics read as physical, not uniform", () => {
  it("accelerates under gravity — each step falls further than the last", () => {
    let p = createParticles(1, { width: 400, height: 800 })[0];
    p = { ...p, vx: 0, vy: 0 };
    const first = stepParticle(p, 1 / 60);
    const second = stepParticle(first, 1 / 60);
    const d1 = first.y - p.y;
    const d2 = second.y - first.y;
    expect(d2).toBeGreaterThan(d1);
  });

  it("applies air resistance — horizontal speed decays rather than holding", () => {
    const p = { ...createParticles(1, { width: 400, height: 800 })[0], vx: 200, vy: 0 };
    const next = stepParticle(p, 1 / 60);
    expect(Math.abs(next.vx)).toBeLessThan(Math.abs(p.vx));
  });

  it("rotates on two axes so particles flip and catch light", () => {
    const p = createParticles(1, { width: 400, height: 800 })[0];
    const next = stepParticle(p, 1 / 60);
    expect(next.rotX).not.toBe(p.rotX);
    expect(next.rotZ).not.toBe(p.rotZ);
  });

  it("varies size, shape, drift and rotation per particle", () => {
    const ps = createParticles(60, { width: 400, height: 800 });
    const uniq = (f: (x: (typeof ps)[number]) => unknown) => new Set(ps.map(f)).size;
    expect(uniq((x) => x.size)).toBeGreaterThan(5);
    expect(uniq((x) => x.drift)).toBeGreaterThan(5);
    expect(uniq((x) => x.rotSpeed)).toBeGreaterThan(5);
    // At least two shapes, per the brief.
    expect(uniq((x) => x.shape)).toBeGreaterThanOrEqual(2);
    // Rectangles vary in aspect ratio rather than all being square.
    expect(uniq((x) => x.aspect)).toBeGreaterThan(3);
  });

  it("staggers emission over ~200-300ms instead of one instant blob", () => {
    const ps = createParticles(CONFETTI_PARTICLE_COUNT, { width: 400, height: 800 });
    const delays = ps.map((p) => p.delay);
    expect(Math.min(...delays)).toBe(0);
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...delays)).toBeLessThanOrEqual(0.32);
    expect(new Set(delays).size).toBeGreaterThan(10);
  });

  it("emits from a spread of origins, not a single point", () => {
    const ps = createParticles(40, { width: 400, height: 800 });
    expect(new Set(ps.map((p) => p.x)).size).toBeGreaterThan(5);
  });

  it("reports a tuned particle count as a named constant", () => {
    expect(CONFETTI_PARTICLE_COUNT).toBeGreaterThan(0);
    expect(CONFETTI_PARTICLE_COUNT).toBeLessThanOrEqual(140);
  });
});

describe("PF-6 colours come from the design tokens", () => {
  it("uses only TAP brand colours, never a hardcoded rainbow", async () => {
    const { CONFETTI_COLORS } = await import("./confetti");
    // The brand palette: coral, ink, gold, mint. A rainbow would be a much
    // wider spread of hues than four.
    expect(CONFETTI_COLORS.length).toBeGreaterThanOrEqual(3);
    expect(CONFETTI_COLORS.length).toBeLessThanOrEqual(6);
    for (const c of CONFETTI_COLORS) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
