import { defineConfig, devices } from "@playwright/test";

// Playwright E2E tests.
//
// The tests run against the REAL production stack: the CRA client build is
// served by the compiled Express backend (same as the Docker image). The
// registration/job endpoints (`/api/status`, `/api/start`, `/api/results`,
// `*_transformations.json`) are mocked at the network level so the suite
// never needs Python; uploads, thumbnails, static image serving and saving
// all hit the real backend.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4000",
    trace: "retain-on-failure",
    // Videos of failing tests are kept under test-results/<test>/video.webm;
    // set PW_VIDEO=all to record every test (also browsable via the HTML
    // report: `yarn e2e:report`).
    video: {
      mode: process.env.PW_VIDEO === "all" ? "on" : "retain-on-failure",
      size: { width: 1280, height: 720 },
    },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:4000/api/server-info",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
