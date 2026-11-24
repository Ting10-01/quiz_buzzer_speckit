import { expect, test, type Page } from '@playwright/test';
import { googleWill } from './googleSignIn';

// T022, T036, T041: teacher sign-in against the real server with a fake Google gateway
// (server/tests/e2e/startTestServer.ts, started by playwright.config.ts on port 3100).
// The server holds one teacher, so these tests run one at a time.
test.describe.configure({ mode: 'serial' });

const TEST_SERVER = 'http://127.0.0.1:3100';

// Same codes and accounts as E2E_CODES / E2E_ACCOUNTS in startTestServer.ts.
const CODE = { teacherA: 'e2e-code-teacher-a', teacherB: 'e2e-code-teacher-b', noDriveScope: 'e2e-code-no-drive-scope' };
const EMAIL = { teacherA: 'teacher.a@example.com', teacherB: 'teacher.b@example.com' };

const SCOPE_DENIED =
  '需要存取雲端硬碟才能讀取學習單。請再按一次「用 Google 登入」，並在 Google 的畫面勾選雲端硬碟檔案那一項。';
const SIGN_IN_AGAIN = '老師登入已失效，請回首頁重新登入';

/** Opens the app with its /api requests sent to the test server. */
async function open(page: Page) {
  await page.route('**/api/**', (route) =>
    route.continue({ url: TEST_SERVER + new URL(route.request().url()).pathname }),
  );
  await page.goto('/');
}

async function toLogin(page: Page) {
  await page.getByRole('button', { name: /我是老師/ }).click();
  await expect(page.getByRole('button', { name: '用 Google 登入' })).toBeVisible();
}

async function signIn(page: Page, code: string) {
  await googleWill(page, { code });
  await page.getByRole('button', { name: '用 Google 登入' }).click();
}

const pickButton = (page: Page) => page.getByRole('button', { name: '從 Google 雲端硬碟挑選' });

test.describe('002 teacher sign-in (T022)', () => {
  test('signs in with account A and shows it on T-Pick (AC-01)', async ({ page }) => {
    await open(page);
    await toLogin(page);
    await signIn(page, CODE.teacherA);
    await expect(pickButton(page)).toBeVisible();
    await expect(page.getByText(EMAIL.teacherA)).toBeVisible();
  });

  test('closing the Google window shows "已取消登入" (AC-03)', async ({ page }) => {
    await open(page);
    await toLogin(page);
    await googleWill(page, { error: 'popup_closed' });
    await page.getByRole('button', { name: '用 Google 登入' }).click();
    await expect(page.getByText('已取消登入')).toBeVisible();
  });

  test('without the Drive permission it stays and says what to do (AC-04)', async ({ page }) => {
    await open(page);
    await toLogin(page);
    await signIn(page, CODE.noDriveScope);
    await expect(page.getByText(SCOPE_DENIED)).toBeVisible();
    await expect(pickButton(page)).toHaveCount(0);
  });
});
