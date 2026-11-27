import { expect, test, type Locator, type Page } from '@playwright/test';
import { pickerWill } from './googlePicker';
import { signInAsPageTeacher } from './googleSignIn';
import { connectTestServer } from './testServer';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// T071, T144: quickstart Q5 (hosting and judging) and Q6 (write-back) with the mock services (M4, M8).

async function expectMockBadge(page: Page) {
  await expect(page.getByText('模擬模式', { exact: true })).toBeVisible();
}

/** Main → T-Login → T-Pick → `sheet` → T-Import → T-Setup → T-Lobby → T-Live (question 1). */
async function toLive(page: Page, sheet: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /我是老師/ }).click();
  await signInAsPageTeacher(page);
  await pickerWill(page, sheet);
  await page.getByRole('button', { name: '從 Google 雲端硬碟挑選' }).click();
  await page.getByRole('button', { name: '確認匯入，下一步' }).click();
  await page.getByRole('button', { name: '建立活動' }).click();
  await page.getByRole('button', { name: '開放第 1 題' }).click();
  await expect(page.getByRole('button', { name: '結束這一題' })).toBeVisible();
}

const answerRows = (page: Page) =>
  page.getByRole('table', { name: '答案列表' }).getByRole('row').filter({ has: page.getByRole('button') });

const rowOf = (page: Page, group: number) => answerRows(page).filter({ hasText: `第 ${group} 組` });

async function expectJudgeable(row: Locator, enabled: boolean) {
  for (const name of ['接受', '不接受']) {
    const button = row.getByRole('button', { name, exact: true });
    await (enabled ? expect(button).toBeEnabled() : expect(button).toBeDisabled());
  }
}

async function judge(page: Page, group: number, name: '接受' | '不接受') {
  await rowOf(page, group).getByRole('button', { name, exact: true }).click();
}

const questionResult = (page: Page) => page.getByRole('region', { name: '本題結果' });

/** On T-QuestionEnd after question n: shows the result and "開放第 n+1 題". */
async function expectQuestionEnd(page: Page, n: number, text: string) {
  await expect(page.getByRole('button', { name: `開放第 ${n + 1} 題` })).toBeVisible();
  await expect(questionResult(page)).toContainText(text);
}

async function openNext(page: Page, n: number) {
  await page.getByRole('button', { name: `開放第 ${n} 題` }).click();
  await expect(page.getByRole('button', { name: '結束這一題' })).toBeVisible();
}

async function endQuestion(page: Page, dialogText?: string) {
  await page.getByRole('button', { name: '結束這一題' }).click();
  const dialog = page.getByRole('dialog', { name: /結束第 \d+ 題/ });
  await expect(dialog).toBeVisible();
  if (dialogText) await expect(dialog).toContainText(dialogText);
  await dialog.getByRole('button', { name: '結束並公布結果' }).click();
}

const writeBackButton = (page: Page) => page.getByRole('button', { name: '寫回 Google Sheets' });
const writeBackDialog = (page: Page) => page.getByRole('dialog', { name: /寫回 Google Sheets/ });

test.describe('US3 hosting (quickstart Q5, Q6)', () => {
  // 005 T041: needs submissions on T-Live and judging, which Phase 4 adds; skipped until T043.
  test.skip('Q5 + Q6 with 題組＋單題範本: judge in order, auto-end, no submissions, write-back succeeds', async ({
    page,
  }) => {
    await toLive(page, '題組＋單題範本');
    await expectMockBadge(page);

    // Question 1: four submissions in rank order; only the earliest is judgeable (US3 AC-2).
    await expect(answerRows(page)).toHaveCount(4);
    await expect(answerRows(page).first()).toContainText('第 2 組');
    await expectJudgeable(rowOf(page, 2), true);
    await expectJudgeable(rowOf(page, 4), false);
    await expectJudgeable(rowOf(page, 1), false);

    // "不接受" moves on to the next submission (US3 AC-4).
    await judge(page, 2, '不接受');
    await expectJudgeable(rowOf(page, 2), false);
    await expectJudgeable(rowOf(page, 4), true);
    await expect(page.getByRole('button', { name: '結束這一題' })).toBeVisible();

    // "接受" ends the question automatically (US3 AC-3).
    await judge(page, 4, '接受');
    await expectQuestionEnd(page, 1, '第 4 組');
    await expectMockBadge(page);

    // Question 2: accept the earliest.
    await openNext(page, 2);
    await expect(answerRows(page)).toHaveCount(2);
    await judge(page, 5, '接受');
    await expectQuestionEnd(page, 2, '第 5 組');

    // Question 3: nobody submits; "結束這一題" → "繼續作答" keeps T-Live, then end it (US3 AC-5–8).
    await openNext(page, 3);
    await expect(answerRows(page)).toHaveCount(0);
    await page.getByRole('button', { name: '結束這一題' }).click();
    const dialog = page.getByRole('dialog', { name: /結束第 3 題/ });
    await dialog.getByRole('button', { name: '繼續作答' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: '結束這一題' })).toBeVisible();
    await endQuestion(page);
    await expectQuestionEnd(page, 3, '沒有組別送出');

    // Question 4 is the last: accepting goes straight to T-Results (FR-032a).
    await openNext(page, 4);
    await judge(page, 1, '接受');
    await expect(writeBackButton(page)).toBeVisible();
    await expect(page.getByRole('region', { name: '第 1 題' })).toContainText('第 4 組');
    await expect(page.getByRole('region', { name: '第 3 題' })).toContainText('沒有組別送出');
    await expect(page.getByRole('region', { name: '第 4 題' })).toContainText('第 1 組');
    await expect(page.getByRole('main')).toContainText('尚未寫回');
    await expectMockBadge(page);

    // Write-back: "取消" does nothing (US3 AC-13); "寫回" shows success and the cell count in the
    // dialog (US3 AC-11); "關閉" leaves the status on the page (US3 AC-14).
    await writeBackButton(page).click();
    await expect(writeBackDialog(page)).toContainText('題組＋單題範本');
    await writeBackDialog(page).getByRole('button', { name: '取消' }).click();
    await expect(writeBackDialog(page)).toBeHidden();
    await expect(page.getByRole('main')).toContainText('尚未寫回');
    await writeBackButton(page).click();
    await writeBackDialog(page).getByRole('button', { name: '寫回', exact: true }).click();
    await expect(writeBackDialog(page)).toContainText('寫回成功');
    await expect(writeBackDialog(page)).toContainText('已寫入 6 格');
    await expect(writeBackDialog(page).getByRole('button')).toHaveText(['關閉']);
    await writeBackDialog(page).getByRole('button', { name: '關閉' }).click();
    await expect(writeBackDialog(page)).toBeHidden();
    await expect(page.getByRole('main')).toContainText('寫回成功');
    await expect(page.getByRole('main')).toContainText('6 格');
  });

  // 005 T041: needs submissions on T-Live and judging, which Phase 4 adds; skipped until T043.
  test.skip('Q5 + Q6 with 單題範本: reject everyone, end the last question, write-back fails', async ({
    page,
  }) => {
    await toLive(page, '單題範本');

    // Questions 1, 2, 4, 5: accept the earliest; question 3 has no submissions.
    for (const n of [1, 2, 3, 4, 5]) {
      if (n > 1) await openNext(page, n);
      if (n === 3) {
        await endQuestion(page);
        await expectQuestionEnd(page, 3, '沒有組別送出');
      } else {
        await answerRows(page).first().getByRole('button', { name: '接受', exact: true }).click();
        await expect(page.getByRole('button', { name: `開放第 ${n + 1} 題` })).toBeVisible();
      }
    }

    // Question 6 (last): reject both, then every judge button is disabled (spec T-Live 全部不接受).
    await openNext(page, 6);
    await judge(page, 5, '不接受');
    await judge(page, 3, '不接受');
    await expectJudgeable(rowOf(page, 5), false);
    await expectJudgeable(rowOf(page, 3), false);

    // Ending the last question says the results page comes next and goes there (US3 AC-9).
    await endQuestion(page, '結果頁');
    await expect(writeBackButton(page)).toBeVisible();
    await expect(page.getByRole('region', { name: '第 6 題' })).toContainText('沒有組別搶答成功');

    // Write-back on the read-only sheet fails with the reason in the dialog (US3 AC-12), and the
    // page keeps the failure after "關閉" (US3 AC-14).
    await writeBackButton(page).click();
    await writeBackDialog(page).getByRole('button', { name: '寫回', exact: true }).click();
    await expect(writeBackDialog(page)).toContainText('寫回失敗');
    await expect(writeBackDialog(page)).toContainText('沒有編輯權限，無法寫回');
    await expect(writeBackDialog(page).getByRole('button')).toHaveText(['關閉']);
    await writeBackDialog(page).getByRole('button', { name: '關閉' }).click();
    await expect(writeBackDialog(page)).toBeHidden();
    await expect(page.getByRole('main')).toContainText('寫回失敗');
    await expect(page.getByRole('main')).toContainText('沒有編輯權限，無法寫回');
  });
});
