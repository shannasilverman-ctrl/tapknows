import { test, expect } from "@playwright/test";

/**
 * Demo journey — walks all six steps and asserts:
 *  Step 3: wallet cards drop in (4 card faces rendered).
 *  Step 4: alert pass with the "You're at Whole Foods." nudge.
 *  Step 5: raised winner ("Amex Gold") with its reasoning line.
 *  Step 6: purchase-specific points, estimated value, and delta render
 *          without fabricating a persisted or annualized balance.
 *
 * The viewer explicitly advances between steps, so the demo never moves
 * while someone is still reading.
 */
test.describe("Demo six-step journey", () => {
  test.setTimeout(60_000);

  test("walks every step and asserts wallet drop, winner, receipt, and value delta", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/demo");

    const next = page.getByRole("button", { name: "Next", exact: true });
    await expect(next).toBeEnabled();

    // ---------- Step 1 · Get started ----------
    await expect(page.getByText(/Step 1 of 6/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2700);
    await expect(page.getByText(/Step 1 of 6/i)).toBeVisible();
    await next.click();

    // ---------- Step 2 · Optional bank sync ----------
    await expect(page.getByText(/Step 2 of 6/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/no bank is connected during this demo/i)).toBeVisible();
    await next.click();

    // ---------- Step 3 · Your wallet (cards drop in) ----------
    await expect(page.getByText(/Step 3 of 6/i)).toBeVisible({ timeout: 10_000 });
    // Wait for the staggered wallet drop to settle (last card ≈ 220 + 3*380 ms).
    await page.waitForTimeout(1800);
    const cardFaces = page.locator(".cs-face");
    await expect(cardFaces).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(cardFaces.nth(i)).toBeVisible();
    }

    await next.click();

    // ---------- Step 4 · At checkout (pass lands) ----------
    await expect(page.getByText(/Step 4 of 6/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/You're at Whole Foods\./i)).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.getByText(/Use your Amex Gold — 4× on groceries\./i)).toBeVisible();

    await next.click();

    // ---------- Step 5 · Optimization (winner rises) ----------
    await expect(page.getByText(/Step 5 of 6/i)).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(
        /Amex Gold earns 4× at U\.S\. supermarkets\. That is 336 Membership Rewards points/i,
      ),
    ).toBeVisible({ timeout: 4_000 });
    // Winner-tinted card face is present.
    await expect(page.locator(".cs-face--winner").first()).toBeVisible();
    await expect(page.locator(".tap-leather-pocket")).toBeVisible();
    await expect(page.locator('.tap-contactless-signal[data-visible="true"]')).toBeVisible();
    await expect(page.getByText(/Value of this choice/i)).toBeVisible();
    const demoSpacing = await page.evaluate(() => {
      const wallet = document.querySelector(".tap-demo-wallet-stage");
      const value = document.querySelector(".tap-demo-value-panel");
      const centerRing = document.querySelector(".tap-contactless-signal i:nth-child(3)");
      if (!wallet || !value || !centerRing) return null;
      const walletRect = wallet.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      return {
        gap: Math.round(valueRect.top - walletRect.bottom),
        centerBackground: getComputedStyle(centerRing).backgroundColor,
      };
    });
    expect(demoSpacing).not.toBeNull();
    expect(demoSpacing!.gap).toBeGreaterThanOrEqual(24);
    expect(demoSpacing!.centerBackground).toBe("rgba(0, 0, 0, 0)");

    await next.click();

    // ---------- Step 6 · Paid (receipt + balance ticks up) ----------
    await expect(page.getByText(/Step 6 of 6/i)).toBeVisible({ timeout: 10_000 });

    // Purchase-specific result copy.
    await expect(page.getByText(/Receipt · Whole Foods/i)).toBeVisible();
    await expect(page.getByText(/Amex Gold earns/i)).toBeVisible();
    await expect(page.getByText(/336 points/i).first()).toBeVisible();
    await expect(page.getByText(/\$6\.72/).first()).toBeVisible();
    await expect(page.getByText(/\+\$5\.00/).first()).toBeVisible();
    await expect(page.getByText(/illustration, not a posted reward balance/i)).toBeVisible();
    await expect(page.getByText(/Recovered this month/i)).toHaveCount(0);
    await expect(page.getByText(/At this pace/i)).toHaveCount(0);
    await expect(page.getByText(/Your balance ticks up/i)).toHaveCount(0);

    // Terminal CTA renders.
    await expect(page.getByRole("link", { name: /Set up my wallet/i })).toBeVisible();

    // No client-side runtime errors along the way.
    expect(errors).toEqual([]);
  });
});
