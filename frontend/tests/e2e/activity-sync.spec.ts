// 004 activity sync across tabs (tasks T028, T044, T050). Pages are 001's and are not changed by 004.
import { expect, test, type Page } from '@playwright/test';
import { GROUP_COUNT_MAX, GROUP_COUNT_MIN, JOIN_METHOD_TEXT } from '@quiz-buzzer/shared/activityRules';
import { expectOn, toSetup } from './us5-walk';

const groupField = (page: Page) => page.getByRole('group', { name: '組數' });
const stepButton = (page: Page, name: '−' | '+') => groupField(page).getByRole('button', { name, exact: true });

test.describe('T028 活動設定頁 (AC-01, AC-02, AC-04)', () => {
  test('starts at 6 groups (AC-01)', async ({ page }) => {
    await toSetup(page);
    await expect(groupField(page)).toContainText('6 組');
  });

  // Needs T042 (Phase 5): until then createServiceRegistry binds MockActivityService, so the
  // server's group count check is never reached from the page.
  test.skip('refuses an out-of-range group count and shows why next to the field (AC-04)', async ({ page }) => {
    await toSetup(page);
    for (let i = 0; i < 5; i += 1) await stepButton(page, '−').click();
    await expect(groupField(page)).toContainText('1 組');
    await page.getByRole('button', { name: '建立活動' }).click();
    await expect(groupField(page)).toContainText('組數必須是 2 到 20 之間的整數');
    await expectOn(page, 'T-Setup');
  });

  // Needs 001 change request C2: SetupPage does not use activityRules yet.
  test.skip('disables "−" at 2 and "+" at 20, and shows the join method text (AC-01, AC-02)', async ({ page }) => {
    await toSetup(page);
    for (let n = 6; n > GROUP_COUNT_MIN; n -= 1) await stepButton(page, '−').click();
    await expect(stepButton(page, '−')).toBeDisabled();
    for (let n = GROUP_COUNT_MIN; n < GROUP_COUNT_MAX; n += 1) await stepButton(page, '+').click();
    await expect(stepButton(page, '+')).toBeDisabled();
    await expect(page.getByRole('region', { name: '這一輪' })).toContainText(JOIN_METHOD_TEXT);
  });
});
