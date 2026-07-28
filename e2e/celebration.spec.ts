// PF-5 / PF-6 in a real browser.
//
// The unit tests cover the physics; these cover the claims that only exist in
// a DOM: the burst does not stack canvases when fired repeatedly, it never
// blocks a click underneath it, it removes itself completely, and a
// reduced-motion user gets an acknowledgment rather than silence.
//
// This drives the actual onboarding flow rather than calling fireConfetti
// directly, because the bundler does not export it — and driving the flow
// proves the integration at the same time.

import { expect, test, type Page } from "@playwright/test";

const CANVAS = "#tap-confetti-canvas";

/** Walk onboarding to completion, which is the one place the burst fires. */
async function completeOnboarding(page: Page) {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Build your wallet." })).toBeVisible();

  // Step 1 — pick a card so the wallet is non-empty (the burst is gated on it).
  await page.getByRole("button", { name: "Amex Gold", exact: true }).click();
  await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Remaining steps: advance until the finish button is gone.
  for (let i = 0; i < 3; i++) {
    const next = page.getByRole("button", { name: /Continue|Start using TAP|Finish|Done/ }).first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(250);
  }
}

test.describe("first-wallet celebration", () => {
  test("fires exactly one canvas, blocks nothing, and cleans itself up", async ({ page }) => {
    await completeOnboarding(page);

    // Exactly one — never a stack.
    await expect(page.locator(CANVAS)).toHaveCount(1, { timeout: 4000 });

    // It must not intercept the tap underneath it.
    const pointerEvents = await page
      .locator(CANVAS)
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe("none");

    // And it must remove itself once the last particle leaves the viewport,
    // rather than lingering as an invisible full-screen layer.
    await expect(page.locator(CANVAS)).toHaveCount(0, { timeout: 12000 });
  });

  test("repeated runs never stack canvases and never leak one", async ({ page }) => {
    // Three full runs. The implementation tears down before every fire, so
    // stacking is structurally impossible; this proves it in a real DOM.
    // Clear the guest wallet on every load, so each run really is a first
    // wallet. Doing this via evaluate() before the first navigation fails —
    // localStorage is not readable on about:blank.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("card_savvy_guest_wallet_v1");
      } catch {
        /* storage unavailable in this context — the run still exercises the flow */
      }
    });

    for (let run = 0; run < 3; run++) {
      await completeOnboarding(page);
      await expect(page.locator(CANVAS)).toHaveCount(1, { timeout: 4000 });
      await expect(page.locator(CANVAS)).toHaveCount(0, { timeout: 12000 });
    }

    // Nothing left behind after all three.
    expect(await page.locator(CANVAS).count()).toBe(0);
  });

  test("reduced motion gets an acknowledgment, not silence", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await completeOnboarding(page);

    // Something IS shown — the failure this guards against is showing nothing.
    const ack = page.locator(CANVAS);
    await expect(ack).toHaveCount(1, { timeout: 4000 });
    await expect(ack).toHaveAttribute("role", "status");
    expect((await ack.textContent())?.trim()).toBeTruthy();

    // Still a static element, not a canvas animation.
    expect(await ack.evaluate((el) => el.tagName)).toBe("DIV");

    // And it also cleans up.
    await expect(ack).toHaveCount(0, { timeout: 8000 });
  });
});
