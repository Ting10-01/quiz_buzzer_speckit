import { defineConfig, devices } from '@playwright/test';

// Playwright loads this file in Node; frontend has no Node types, so declare only what is used.
declare const process: { env: Record<string, string | undefined> };

const baseURL = 'http://localhost:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
