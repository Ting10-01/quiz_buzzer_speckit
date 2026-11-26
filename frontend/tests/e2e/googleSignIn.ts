// E2E stand-ins for Google sign-in (002 research RD-12). The Google Identity Services script is
// replaced, so the "Google" popup returns a fixed code or error without contacting Google.
import type { Page } from '@playwright/test';
import { fakeGuidedNotesApi } from './googlePicker';
import { connectTestServer } from './testServer';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Reads the response at click time, so one page can sign in several times with different results.
const GIS_STUB = `window.google = Object.assign(window.google || {}, { accounts: { oauth2: { initCodeClient: (config) => ({
  requestCode: () => setTimeout(() => {
    const r = window.__googleResponse || { error: 'popup_closed' };
    if (r.code) config.callback({ code: r.code });
    else config.error_callback({ type: r.error });
  }, 0),
}) } } });`;

export type GoogleResponse = { code: string } | { error: 'popup_closed' | 'popup_failed_to_open' };

/** The next "Google" popup in the current page returns `response`. */
export async function googleWill(page: Page, response: GoogleResponse) {
  await page.route(GIS_SRC, (route) => route.fulfill({ contentType: 'text/javascript', body: GIS_STUB }));
  await page.evaluate((r) => {
    (window as unknown as { __googleResponse: GoogleResponse }).__googleResponse = r;
  }, response);
}

/**
 * Sends /api/auth/* to this worker's test server (testServer.ts), where the code 'e2e-code' signs in
 * teacher@example.com through the fake Google gateway. 004 (T061): the teacher must be really signed in,
 * because the activity commands go to the server; before 004 these answers were faked in the page.
 */
export async function fakeTeacherApi(page: Page) {
  await connectTestServer(page);
}

/**
 * On T-Login: clicks "用 Google 登入" as the page teacher (replaces the 001 mock account chooser).
 * Also fakes the Picker and import API, since every teacher walk goes on to pick a sheet.
 */
export async function signInAsPageTeacher(page: Page) {
  await fakeTeacherApi(page);
  await fakeGuidedNotesApi(page);
  await googleWill(page, { code: 'e2e-code' });
  await page.getByRole('button', { name: '用 Google 登入' }).click();
}
