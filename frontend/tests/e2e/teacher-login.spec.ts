import { expect, test, type Page } from '@playwright/test';
import { googleWill } from './googleSignIn';
import { TEST_SERVER, startTestServer } from './testServer';

// T022, T036, T041: teacher sign-in against the real server with a fake Google gateway
// (testServer.ts starts server/tests/e2e/startTestServer.ts on port 3100).
// The server holds one teacher, so these tests run one at a time.
test.describe.configure({ mode: 'serial' });

let stopServer: (() => void) | undefined;
test.beforeAll(async () => {
  stopServer = await startTestServer();
});
test.afterAll(() => stopServer?.());

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

test.describe('002 signing in again (T036)', () => {
  test('a reload keeps the tab credential, and signing in again reaches T-Pick (AC-07, AC-09)', async ({ page }) => {
    await open(page);
    await toLogin(page);
    await signIn(page, CODE.teacherA);
    await expect(pickButton(page)).toBeVisible();

    await page.reload();
    expect(await page.evaluate(() => sessionStorage.getItem('teacherToken'))).toBeTruthy();

    // D21 temporary limitation: after a reload the teacher goes through T-Login to T-Pick.
    await toLogin(page);
    await signIn(page, CODE.teacherA);
    await expect(pickButton(page)).toBeVisible();
  });

  test('another teacher signing in makes the first tab sign in again (AC-08, AC-26)', async ({ page, browser }) => {
    await open(page);
    await toLogin(page);
    await signIn(page, CODE.teacherA);
    // Tab 1 moves on to T-Import (guidedNotes is still the 001 mock here).
    await pickButton(page).click();
    await page.getByRole('dialog', { name: '模擬檔案選擇器' }).getByRole('button', { name: '題組＋單題範本' }).click();
    await expect(page.getByRole('button', { name: '確認匯入，下一步' })).toBeVisible();

    const other = await browser.newContext();
    const pageB = await other.newPage();
    await open(pageB);
    await toLogin(pageB);
    await signIn(pageB, CODE.teacherB);
    await expect(pageB.getByText(EMAIL.teacherB)).toBeVisible();

    // Back on T-Pick, tab 1 asks for its account again and learns it was replaced.
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('alert')).toHaveText(SIGN_IN_AGAIN);
    expect(await page.evaluate(() => sessionStorage.getItem('teacherToken'))).toBeNull();
    await other.close();
  });
});

test.describe('002 student tabs never get the teacher credential (T041)', () => {
  test('a student tab in the same browser has no credential and is refused (AC-11)', async ({ page, context }) => {
    await open(page);
    await toLogin(page);
    await signIn(page, CODE.teacherA);
    await expect(pickButton(page)).toBeVisible();

    const student = await context.newPage();
    await open(student);
    await student.getByRole('button', { name: /我是學生/ }).click();
    expect(await student.evaluate(() => sessionStorage.getItem('teacherToken'))).toBeNull();
    expect(await student.evaluate(() => document.cookie)).toBe('');
    expect(await student.evaluate(async () => (await fetch('/api/auth/me')).status)).toBe(401);
  });
});
