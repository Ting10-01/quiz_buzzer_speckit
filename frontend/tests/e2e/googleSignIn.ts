// E2E stand-ins for Google sign-in (002 research RD-12). The Google Identity Services script is
// replaced, so the "Google" popup returns a fixed code or error without contacting Google.
import type { Page } from '@playwright/test';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Reads the response at click time, so one page can sign in several times with different results.
const GIS_STUB = `window.google = { accounts: { oauth2: { initCodeClient: (config) => ({
  requestCode: () => setTimeout(() => {
    const r = window.__googleResponse || { error: 'popup_closed' };
    if (r.code) config.callback({ code: r.code });
    else config.error_callback({ type: r.error });
  }, 0),
}) } } };`;

export type GoogleResponse = { code: string } | { error: 'popup_closed' | 'popup_failed_to_open' };

/** The next "Google" popup in the current page returns `response`. */
export async function googleWill(page: Page, response: GoogleResponse) {
  await page.route(GIS_SRC, (route) => route.fulfill({ contentType: 'text/javascript', body: GIS_STUB }));
  await page.evaluate((r) => {
    (window as unknown as { __googleResponse: GoogleResponse }).__googleResponse = r;
  }, response);
}

export const PAGE_TEACHER = { name: '模擬老師', email: 'teacher@example.com' };

/**
 * Answers /api/auth/* inside the page with a signed-in teacher. For the 001 page walks, which only
 * need "a teacher is signed in" and run in parallel; the real server allows one teacher at a time,
 * so only teacher-login.spec.ts talks to it.
 */
export async function fakeTeacherApi(page: Page) {
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: { clientId: 'e2e-client' } }));
  await page.route('**/api/auth/google', (route) =>
    route.fulfill({ json: { ok: true, teacherToken: 'e2e-token', account: PAGE_TEACHER } }),
  );
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: PAGE_TEACHER }));
}

/** On T-Login: clicks "用 Google 登入" as the page teacher (replaces the 001 mock account chooser). */
export async function signInAsPageTeacher(page: Page) {
  await fakeTeacherApi(page);
  await googleWill(page, { code: 'e2e-code' });
  await page.getByRole('button', { name: '用 Google 登入' }).click();
}
