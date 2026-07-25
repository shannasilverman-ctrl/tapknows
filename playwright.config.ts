import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for TAP e2e tests.
 * Defaults to local development; TAP_BASE_URL targets an immutable preview.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TAP_BASE_URL || "http://127.0.0.1:8080",
    viewport: { width: 390, height: 900 },
    trace: "off",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
