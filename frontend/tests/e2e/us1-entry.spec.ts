import { expect, test, type Page } from '@playwright/test';

async function expectMockBadge(page: Page) {
  await expect(page.getByText('模擬模式', { exact: true })).toBeVisible();
}

test.describe('US1 entry (quickstart Q1, Q2)', () => {
  test('Q1: home → student join page, then home → teacher login page', async ({ page }) => {
    await page.goto('/');
    await expectMockBadge(page);
    await page.getByRole('button', { name: /我是學生/ }).click();
    await expect(page.getByText('目前沒有活動，請等老師建立活動')).toBeVisible();
    await expectMockBadge(page);

    await page.goto('/');
    await page.getByRole('button', { name: /我是老師/ }).click();
    await expect(page.getByRole('button', { name: '用 Google 登入' })).toBeVisible();
    await expectMockBadge(page);
  });

  test('Q2: the two mock account choices', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /我是老師/ }).click();
    const login = page.getByRole('button', { name: '用 Google 登入' });

    await login.click();
    const chooser = page.getByRole('dialog', { name: '模擬帳號選擇' });
    await expect(chooser.getByRole('button')).toHaveText(['模擬老師帳號', '取消']);
    await chooser.getByRole('button', { name: '取消' }).click();
    await expect(page.getByText('已取消登入')).toBeVisible();
    await expectMockBadge(page);

    await expect(chooser).toBeHidden();

    await login.click();
    await page.getByRole('dialog').getByRole('button', { name: '模擬老師帳號' }).click();
    await expect(page.getByRole('button', { name: '從 Google 雲端硬碟挑選' })).toBeVisible();
    await expect(page.getByText('teacher@example.com')).toBeVisible();
    await expectMockBadge(page);

    await page.getByRole('button', { name: '搶答板' }).click();
    await expect(page.getByRole('button', { name: /我是老師/ })).toBeVisible();
  });
});
