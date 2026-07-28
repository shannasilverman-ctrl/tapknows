// A confetti burst that behaves like paper rather than like a spray of divs.
//
// Cheap confetti gives itself away three ways: everything falls at the same
// speed, everything is the same size and shape, and it all leaves the emitter
// in the same instant. So particles here accelerate under gravity with air
// resistance, each carries its own size / shape / aspect / drift / spin, and
// emission is staggered across ~280ms from a spread of origins.
//
// The physics are a pure function (`stepParticle`) so they can be asserted in
// a unit test without a browser. `fireConfetti` owns the canvas lifecycle.

export const CONFETTI_COLORS = ["#f06b4f", "#24152b", "#e9cd93", "#b9ddcf"] as const;

/**
 * Tuned on a 6x-throttled CPU profile (roughly a mid-range phone) — see the
 * commit message for the measured frame timings. Raising this looks marginally
 * denser and costs frame budget; the burst reads as full at this count because
 * the stagger keeps particles on screen longer than a single blob would.
 */
export const CONFETTI_PARTICLE_COUNT = 90;

const GRAVITY = 900; // px/s², tuned so a particle crosses a phone screen in ~1.4s
const DRAG = 1.6; // s⁻¹, air resistance — this is what stops constant-speed fall
const EMIT_WINDOW = 0.28; // s, the stagger the brief asks for

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  aspect: number;
  shape: "rect" | "circle";
  color: string;
  drift: number;
  rotX: number;
  rotZ: number;
  rotSpeed: number;
  delay: number;
  life: number;
};

type Viewport = { width: number; height: number };

/** Deterministic-ish spread helper: varied per particle without being clumpy. */
function jitter(i: number, n: number, spread: number): number {
  return (i / Math.max(1, n - 1) - 0.5) * 2 * spread;
}

export function createParticles(count: number, vp: Viewport): Particle[] {
  const out: Particle[] = [];
  // A spread of origins across the middle of the viewport, never one point.
  const originY = vp.height * 0.42;
  for (let i = 0; i < count; i++) {
    const originX = vp.width * 0.5 + jitter(i, count, vp.width * 0.16);
    const angle = -Math.PI / 2 + jitter(i, count, 0.9) + (Math.random() - 0.5) * 0.5;
    const speed = 520 + Math.random() * 420;
    out.push({
      x: originX + (Math.random() - 0.5) * 12,
      y: originY + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 8,
      aspect: 0.35 + Math.random() * 1.1,
      shape: Math.random() < 0.72 ? "rect" : "circle",
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      drift: (Math.random() - 0.5) * 90,
      rotX: Math.random() * Math.PI * 2,
      rotZ: Math.random() * Math.PI * 2,
      rotSpeed: 2 + Math.random() * 7,
      // Spread across the emit window, with 0 guaranteed so the burst starts
      // immediately rather than after a gap.
      delay: i === 0 ? 0 : Math.random() * EMIT_WINDOW,
      life: 0,
    });
  }
  return out;
}

/** One frame of motion. Pure, so the physics claims are testable. */
export function stepParticle(p: Particle, dt: number): Particle {
  // Air resistance pulls velocity toward the drift target instead of letting
  // it run constant; gravity keeps accumulating underneath it.
  const vx = p.vx + (p.drift - p.vx) * DRAG * dt;
  const vy = p.vy + GRAVITY * dt - p.vy * DRAG * dt * 0.35;
  return {
    ...p,
    vx,
    vy,
    x: p.x + vx * dt,
    y: p.y + vy * dt,
    rotX: p.rotX + p.rotSpeed * dt,
    rotZ: p.rotZ + p.rotSpeed * 0.6 * dt,
    life: p.life + dt,
  };
}

const CANVAS_ID = "tap-confetti-canvas";
let rafId: number | null = null;

function teardown() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  document.getElementById(CANVAS_ID)?.remove();
}

/** Reduced motion still gets an answer — it just does not move. */
function staticAcknowledgment() {
  const el = document.createElement("div");
  el.id = CANVAS_ID;
  el.setAttribute("role", "status");
  el.textContent = "Wallet ready";
  el.style.cssText =
    "position:fixed;inset:auto 0 84px 0;margin:auto;width:max-content;z-index:9999;" +
    "pointer-events:none;padding:10px 18px;border-radius:999px;font-weight:600;" +
    `background:${CONFETTI_COLORS[0]};color:#fff;`;
  document.body.appendChild(el);
  window.setTimeout(teardown, 1400);
}

/**
 * Fire the burst. Safe to call rapidly and repeatedly: each call tears down any
 * previous canvas first, so canvases never stack and the frame loop never runs
 * twice. The canvas removes itself once the last particle leaves the viewport.
 */
export function fireConfetti(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  teardown();

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    staticAcknowledgment();
    return;
  }

  const vp = { width: window.innerWidth, height: window.innerHeight };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = document.createElement("canvas");
  canvas.id = CANVAS_ID;
  canvas.width = vp.width * dpr;
  canvas.height = vp.height * dpr;
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:9999;pointer-events:none;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    teardown();
    return;
  }
  ctx.scale(dpr, dpr);

  let particles = createParticles(CONFETTI_PARTICLE_COUNT, vp);
  let last = performance.now();
  let elapsed = 0;

  const frame = (now: number) => {
    // Clamp dt so a backgrounded tab does not teleport every particle offscreen
    // on the first frame back.
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    elapsed += dt;

    ctx.clearRect(0, 0, vp.width, vp.height);

    let alive = 0;
    particles = particles.map((p) => {
      if (elapsed < p.delay) {
        alive++;
        return p;
      }
      const next = stepParticle(p, dt);
      if (next.y - next.size > vp.height) return next; // gone, stop drawing
      alive++;

      ctx.save();
      ctx.translate(next.x, next.y);
      ctx.rotate(next.rotZ);
      // Flattening on the X axis is what makes a piece look like it is
      // flipping edge-on rather than sliding.
      const flip = Math.abs(Math.cos(next.rotX));
      ctx.globalAlpha = 0.85 + flip * 0.15;
      ctx.fillStyle = next.color;
      const w = next.size * next.aspect;
      const h = next.size * Math.max(0.12, flip);
      if (next.shape === "circle") {
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
      return next;
    });

    if (alive === 0) {
      teardown();
      return;
    }
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);
}
