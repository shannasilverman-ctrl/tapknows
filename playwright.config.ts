import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.TAP_BASE_URL;
const localBaseURL = "http://127.0.0.1:8096";

/**
 * Playwright config for TAP e2e tests.
 * Defaults to local development; TAP_BASE_URL targets an immutable preview.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // TAP's journeys intentionally exercise shared SSR and third-party fallbacks.
  // Serialize the release suite so browser pressure cannot create false visual
  // baselines or mask a deterministic customer-path failure.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: externalBaseURL || localBaseURL,
    viewport: { width: 390, height: 900 },
    trace: "off",
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 8096",
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          VITE_SUPABASE_URL: "http://127.0.0.1:54321",
          VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
          SUPABASE_URL: "http://127.0.0.1:54321",
          SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
        },
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
