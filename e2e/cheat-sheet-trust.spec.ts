import { expect, test } from "@playwright/test";

const guestWallet = {
  cards: [
    { id: "guest_amex", card_catalog_id: "amex_gold", nickname: null },
    { id: "guest_chase", card_catalog_id: "chase_csp", nickname: null },
    { id: "guest_citi", card_catalog_id: "citi_double_cash", nickname: null },
  ],
  offers: [],
  overrides: [],
  accounts: [],
  prefs: {
    utilization_enabled: false,
    utilization_threshold_pct: 10,
    utilization_behavior: "warn",
  },
};

test.describe("cheat-sheet trust and first-glance hierarchy", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((wallet) => {
      window.localStorage.setItem("card_savvy_guest_wallet_v1", JSON.stringify(wallet));
    }, guestWallet);
  });

  test("shows a real answer in the first desktop viewport with explicit assumptions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/cheat-sheet");

    const dining = page.getByRole("article", { name: /Dining: tap/i });
    await expect(dining).toBeInViewport({ ratio: 0.6 });
    await expect(page.getByText("Compared on a representative $100 purchase")).toBeVisible();
    await expect(dining.getByText(/¢\/pt · TAP default/)).toBeVisible();
    await expect(page.locator(".tap-cheat-carry .cs-face-number")).toHaveCount(0);
  });
});
