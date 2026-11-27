import { expect, test, type Page } from '@playwright/test';
import { fakeTeacherApi, googleWill } from './googleSignIn';
import { connectTestServer } from './testServer';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// 006 T036: every interface is real, so the "模擬模式" label is gone (001 FR-005).
async function expectNoMockBadge(page: Page) {
  await expect(page.getByText('模擬模式', { exact: true })).toHaveCount(0);
}

test.describe('US1 entry (quickstart Q1, Q2, Q14)', () => {
  test('Q1: home → student join page, then home → teacher login page', async ({ page }) => {
    await page.goto('/');
    await expectNoMockBadge(page);
    await page.getByRole('button', { name: /我是學生/ }).click();
    await expect(page.getByText('目前沒有活動，請等老師建立活動')).toBeVisible();
    await expectNoMockBadge(page);

    await page.goto('/');
    await page.getByRole('button', { name: /我是老師/ }).click();
    await expect(page.getByRole('button', { name: '用 Google 登入' })).toBeVisible();
    await expectNoMockBadge(page);
  });

  // 002 replaced the mock account chooser with Google sign-in; the popup is stubbed (googleSignIn.ts).
  test('Q2: cancelled sign-in, then signed in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /我是老師/ }).click();
    const login = page.getByRole('button', { name: '用 Google 登入' });

    await fakeTeacherApi(page);
    await googleWill(page, { error: 'popup_closed' });
    await login.click();
    await expect(page.getByText('已取消登入')).toBeVisible();
    await expectNoMockBadge(page);

    await googleWill(page, { code: 'e2e-code' });
    await login.click();
    await expect(page.getByRole('button', { name: '從 Google 雲端硬碟挑選' })).toBeVisible();
    await expect(page.getByText('teacher@example.com')).toBeVisible();
    await expectNoMockBadge(page);

    await page.getByRole('button', { name: '搶答板' }).click();
    await expect(page.getByRole('button', { name: /我是老師/ })).toBeVisible();
  });

  test('Q14: 返回首頁 and browser back on T-Login and S-Join', async ({ page }) => {
    const home = page.getByRole('button', { name: /我是老師/ });
    await page.goto('/');

    await page.getByRole('button', { name: /我是學生/ }).click();
    await expect(page.getByText('目前沒有活動，請等老師建立活動')).toBeVisible();
    await page.getByRole('button', { name: '返回首頁' }).click();
    await expect(home).toBeVisible();

    await page.getByRole('button', { name: /我是學生/ }).click();
    await expect(page.getByText('目前沒有活動，請等老師建立活動')).toBeVisible();
    await page.goBack();
    await expect(home).toBeVisible();

    await home.click();
    await page.getByRole('button', { name: '返回首頁' }).click();
    await expect(home).toBeVisible();

    await home.click();
    await page.goBack();
    await expect(home).toBeVisible();

    // Back on the home page stays in the app.
    await page.goBack();
    await expect(home).toBeVisible();
  });
});
