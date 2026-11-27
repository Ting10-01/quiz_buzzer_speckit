// 005 T031: the success rule on T-Setup's summary (AC-26, REQ-SUB-18). The text is 001's
// (docs/feature-split.md 3.2); 005 does not change the page.
import { expect, test, type Page } from '@playwright/test';
import { connectTestServer } from './testServer';
import { toSetup } from './us5-walk';

test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

/** The "成功規則" entry of the "這一輪" summary. */
const successRule = (page: Page) =>
  page.getByRole('region', { name: '這一輪' }).getByRole('definition').filter({ hasText: '老師依送出順序判定' });

test.describe('T031 成功規則說明 (AC-26)', () => {
  test('says the teacher judges in order and the first accepted group wins', async ({ page }) => {
    await toSetup(page);
    await expect(successRule(page)).toContainText('老師依送出順序判定，第一個被接受的組別搶答成功');
  });

  test('says each group submits once per question and cannot submit again after a rejection', async ({ page }) => {
    await toSetup(page);
    await expect(successRule(page)).toContainText('每組每題只能送出一次，被拒絕後不能重送');
  });
});
