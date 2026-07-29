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
    await expect(dining.getByText("$8 est. travel value", { exact: true })).toBeVisible();
    await expect(page.getByText("Compared on a representative $100 purchase")).toBeVisible();
    await expect(page.getByText(/¢\/pt · TAP default/)).toBeVisible();
    await expect(page.getByText("Simple win", { exact: true })).toHaveCount(0);
    await expect(page.locator(".tap-cheat-carry .cs-face-number")).toHaveCount(0);

    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".tap-cheat-v2-table-head")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    const printTableHeight = await page.locator(".tap-cheat-v2-table").evaluate((element) => {
      return element.getBoundingClientRect().height;
    });
    expect(printTableHeight).toBeLessThan(600);
  });

  test("keeps the estimated dollar return visible on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cheat-sheet");

    const dining = page.getByRole("article", { name: /Dining: tap/i });
    await expect(dining.getByText("$8 est. travel value", { exact: true })).toBeVisible();
  });

  test("uses a purposeful desktop wallet and never repeats one card six times", async ({
    page,
  }) => {
    await page.addInitScript(
      (wallet) => {
        window.localStorage.setItem("card_savvy_guest_wallet_v1", JSON.stringify(wallet));
      },
      {
        ...guestWallet,
        cards: [{ id: "guest_amex", card_catalog_id: "amex_gold", nickname: null }],
      },
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/cards");

    await expect(page.getByRole("heading", { name: "Your card’s strongest jobs." })).toBeVisible();
    await expect(page.locator(".tap-wallet-v2-role-grid li")).toHaveCount(3);
    await expect(page.getByText("Best for everyday", { exact: true })).toBeVisible();
    await expect(page.locator(".tap-wallet-v2-pass")).toBeVisible();

    const mainWidth = await page.locator(".tap-wallet-v2-main").evaluate((element) => {
      return element.getBoundingClientRect().width;
    });
    expect(mainWidth).toBeGreaterThanOrEqual(1000);
  });
});
