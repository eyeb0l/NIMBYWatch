import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3147);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  outputDir: process.env.E2E_ARTIFACT_DIR || "test-results",
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${port}`,
        url: baseURL,
        env: {
          PGLITE_DATA_DIR: `${process.cwd()}/.data/e2e-${port}`,
          DATABASE_URL: "",
          OPENAI_API_KEY: "",
          ADMIN_TOKEN: "",
        },
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
