import { expect, test, type Page } from '@playwright/test';
import {
  advance,
  expectOn,
  join,
  mockBar,
  submit,
  toAnswer,
  toImport,
  toImportError,
  toJoin,
  toLastAnswer,
  toLive,
  toLobby,
  toLogin,
  toPick,
  toQuestionEnd,
  toResults,
  toSetup,
  toStudentQuestionDone,
  toStudentResults,
  toSubmitted,
  toWait,
  type PageId,
} from './us5-walk';

// T094: the mock control bar shows only the FR-061 controls on each page (US5 AC-4–AC-8).

const ADVANCE = '模擬：推進到下一個階段';
const ACCEPT = '模擬：接受';
const REJECT = '模擬：不接受';
const TEAMMATE = '模擬：同組組員送出';
const VALIDATION = '模擬：驗證失敗';
const UNEXPECTED = '模擬：非預期錯誤';

/** FR-061: the exact set of controls each page (and S-Submitted state) shows. */
const EXPECTED: [PageId, (page: Page) => Promise<void>, string[]][] = [
  ['Main', async (page) => {
    await page.goto('/');
    await expectOn(page, 'Main');
  }, [ADVANCE]],
  ['T-Login', toLogin, [UNEXPECTED]],
  ['T-Pick', toPick, [UNEXPECTED]],
  ['T-Import', (page) => toImport(page), [UNEXPECTED]],
  ['T-ImportError', toImportError, [UNEXPECTED]],
  ['T-Setup', (page) => toSetup(page), [VALIDATION, UNEXPECTED]],
  ['T-Lobby', (page) => toLobby(page), [UNEXPECTED]],
  ['T-Live', (page) => toLive(page), [UNEXPECTED]],
  ['T-QuestionEnd', toQuestionEnd, [UNEXPECTED]],
  ['T-Results', (page) => toResults(page), [UNEXPECTED]],
  ['S-JoinEmpty', (page) => toJoin(page), [ADVANCE, UNEXPECTED]],
  ['S-Join', (page) => toJoin(page, 1), [ADVANCE, UNEXPECTED]],
  ['S-Wait', toWait, [ADVANCE, UNEXPECTED]],
  ['S-Answer', toAnswer, [ADVANCE, TEAMMATE, VALIDATION, UNEXPECTED]],
  ['S-Submitted', toSubmitted, [ADVANCE, ACCEPT, REJECT]],
  ['S-Rejected', async (page) => {
    await toSubmitted(page);
    await page.getByRole('button', { name: REJECT }).click();
    await expectOn(page, 'S-Rejected');
  }, [ADVANCE]],
  ['S-QuestionDone', toStudentQuestionDone, [ADVANCE]],
  ['S-Results', toStudentResults, []],
];

async function expectControls(page: Page, expected: string[]) {
  if (expected.length === 0) {
    await expect(mockBar(page)).toHaveCount(0);
    return;
  }
  const buttons = mockBar(page).getByRole('button');
  await expect(buttons).toHaveCount(expected.length);
  const labels = (await buttons.allTextContents()).sort();
  expect(labels).toEqual([...expected].sort());
}

test.describe('US5 mock controls per page (FR-061, US5 AC-6, AC-7)', () => {
  for (const [id, reach, expected] of EXPECTED) {
    test(`${id}: shows exactly [${expected.join('、')}]`, async ({ page }) => {
      await reach(page);
      await expectOn(page, id);
      await expectControls(page, expected);
    });
  }
});

test.describe('US5 mock control behaviour', () => {
  test('AC-4: on S-Wait, advancing goes to S-Answer for question 1', async ({ page }) => {
    await toWait(page);
    await page.getByRole('button', { name: ADVANCE }).click();
    await expectOn(page, 'S-Answer');
    await expect(page.getByText('第 1 題 / 共 4 題')).toBeVisible();
  });

  test('AC-5: 模擬：接受 goes to S-QuestionDone (not the last question)', async ({ page }) => {
    await toSubmitted(page);
    await page.getByRole('button', { name: ACCEPT }).click();
    await expectOn(page, 'S-QuestionDone');
  });

  test('AC-5: 模擬：接受 on the last question goes to S-Results', async ({ page }) => {
    await toLastAnswer(page);
    await submit(page);
    await page.getByRole('button', { name: ACCEPT }).click();
    await expectOn(page, 'S-Results');
  });

  test('AC-5: 模擬：不接受 stays on S-Submitted in the not-accepted state', async ({ page }) => {
    await toSubmitted(page);
    await page.getByRole('button', { name: REJECT }).click();
    await expectOn(page, 'S-Rejected');
    await expect(page.getByRole('button', { name: ACCEPT })).toHaveCount(0);
    await expect(page.getByRole('button', { name: REJECT })).toHaveCount(0);
  });

  test('AC-8: 模擬：驗證失敗 only affects the next 建立活動', async ({ page }) => {
    await toSetup(page);
    await page.getByRole('button', { name: VALIDATION }).click();
    await page.getByRole('button', { name: '建立活動' }).click();
    await expectOn(page, 'T-Setup');
    await expect(page.getByRole('group', { name: '組數' }).getByText(VALIDATION)).toBeVisible();
    await page.getByRole('button', { name: '建立活動' }).click();
    await expectOn(page, 'T-Lobby');
  });

  test('AC-8: 模擬：驗證失敗 only affects the next 儲存設定', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '修改設定' }).click();
    await page.getByRole('button', { name: VALIDATION }).click();
    await page.getByRole('button', { name: '儲存設定' }).click();
    await expectOn(page, 'T-Setup');
    await page.getByRole('button', { name: '儲存設定' }).click();
    await expectOn(page, 'T-Lobby');
  });

  test('AC-8: 模擬：驗證失敗 only affects the next 整組送出', async ({ page }) => {
    await toAnswer(page);
    await page.getByRole('button', { name: VALIDATION }).click();
    await submit(page);
    await expectOn(page, 'S-Answer');
    await expect(page.getByRole('textbox').first()).toHaveAccessibleDescription(VALIDATION);
    await submit(page);
    await expectOn(page, 'S-Submitted');
  });

  test('boundary: advancing after FINISHED changes nothing (M7)', async ({ page }) => {
    await toJoin(page, 9);
    await expect(page.getByText('已結束', { exact: true })).toBeVisible();
    await advance(page);
    await expectOn(page, 'S-Join');
    await expect(page.getByText('已結束', { exact: true })).toBeVisible();
    await join(page);
    await expectOn(page, 'S-Results');
    await expect(mockBar(page)).toHaveCount(0);
  });

  test('boundary: advancing on Main after FINISHED keeps 已結束', async ({ page }) => {
    await page.goto('/');
    await advance(page, 9);
    await expect(page.getByText('已結束', { exact: true })).toBeVisible();
    await advance(page, 2);
    await expectOn(page, 'Main');
    await expect(page.getByText('已結束', { exact: true })).toBeVisible();
  });
});
