import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against an isolated, fully simulated copy of the app
 * (scripts/e2e-server.sh). Uses the installed Google Chrome.
 *   npm run e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "phone-360", use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, channel: "chrome" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "bash scripts/e2e-server.sh",
    url: "http://localhost:3100/legal/returns",
    reuseExistingServer: true,
    timeout: 400_000,
  },
});
