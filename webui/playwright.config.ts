import { defineConfig, devices } from "@playwright/test";

// Deterministic demo/visual test (spec §6). Screenshots are compared only in CI, which runs in the
// pinned mcr.microsoft.com/playwright:v1.63.0-noble image, so baselines never come from a Mac.
const ci = !!process.env.CI;
const port = 3100;

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0, // a flaky screenshot should show up, not be retried away
  forbidOnly: ci,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  ignoreSnapshots: !ci,
  expect: {
    timeout: 15_000, // server-side GitHub content fetches on the skill and Similar pages
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.001 },
  },
  use: {
    ...devices["Desktop Chrome"],
    ...(ci ? {} : { channel: "chrome" }), // locally: the installed Chrome, no browser download
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    video: { mode: "on", size: { width: 1280, height: 720 } },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    env: { SKILL_ATLAS_DIR: "e2e/fixtures" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
