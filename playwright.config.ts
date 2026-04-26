import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Vitest unit tests live alongside Playwright specs but use the .test.ts
  // suffix; Playwright owns *.spec.ts only.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    [process.env.CI ? "github" : "list"],
    [
      "executable-stories-playwright/reporter",
      {
        formats: ["markdown", "html"],
        outputDir: "docs/evidence",
        outputName: "playwright-tests",
        rawRunPath: ".executable-stories/playwright-raw-run.json",
        output: { mode: "aggregated" },
        markdown: {
          title: "Mountly Playwright Stories",
          includeStatusIcons: true,
          includeErrors: true,
          includeMetadata: true,
          sortScenarios: "source",
        },
        html: {
          title: "Mountly Playwright Stories",
          darkMode: false,
          searchable: true,
        },
      },
    ],
  ],
  timeout: 15000,
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter mountly-demo dev",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm exec serve -l 5175 --no-port-switching .",
      url: "http://localhost:5175",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
