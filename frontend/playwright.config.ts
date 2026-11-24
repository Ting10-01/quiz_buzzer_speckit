import { defineConfig, devices } from '@playwright/test';

// Playwright loads this file in Node; frontend has no Node types, so declare only what is used.
declare const process: { env: Record<string, string | undefined> };

const baseURL = 'http://localhost:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
    {
      // 002: the real server with Google replaced by a fake (server/tests/e2e/startTestServer.ts).
      // Its own port, so a running dev server with real Google settings is never used by tests;
      // teacher-login.spec.ts sends the page's /api requests here.
      command: 'npx tsx ../server/tests/e2e/startTestServer.ts',
      url: 'http://127.0.0.1:3100/api/auth/config',
      env: { PORT: '3100' },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
