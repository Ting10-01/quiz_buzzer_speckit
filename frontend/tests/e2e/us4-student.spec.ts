import { expect, test, type Page } from '@playwright/test';
import { connectTestServer } from './testServer';
// 004 (T061): the shared step also works once the mock advance control is gone.
import { advance } from './us5-walk';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// T084: quickstart Q7 (accepted, not accepted, groupmate submits), Q8 (every phase) and
// Q13 (where joining leads) with the mock services (M5–M7), plus SC-007 / FR-054.

const GROUP = 3;
/** Any group number other than this tab's group. */
const OTHER_GROUP = /第 [1245-9] 組/;

async function expectMockBadge(page: Page) {
  await expect(page.getByText('模擬模式', { exact: true })).toBeVisible();
}

/** Main → S-Join, then advances `steps` times on S-Join (M7) before joining GROUP. */
async function joinAfter(page: Page, steps: number) {
  await page.goto('/');
  await page.getByRole('button', { name: /我是學生/ }).click();
  await expect(page.getByText('目前沒有活動，請等老師建立活動')).toBeVisible();
  await advance(page, steps);
  await page.getByRole('radio', { name: new RegExp(`第 ${GROUP} 組`) }).click();
  await page.getByRole('button', { name: `加入第 ${GROUP} 組` }).click();
}

const submitButton = (page: Page) => page.getByRole('button', { name: '整組送出' });
const waiting = (page: Page) => page.getByText('等待老師判定');
const questionResult = (page: Page) => page.getByRole('region', { name: '本題結果' });
const myAnswers = (page: Page) => page.getByRole('region', { name: '本組送出的答案' });

async function expectAnswerPage(page: Page, n: number) {
  await expect(page.getByText(`第 ${n} 題 / 共 4 題`)).toBeVisible();
  await expect(submitButton(page)).toBeVisible();
  await expectMockBadge(page);
}

/** SC-007, FR-054: nothing on the page names another group. */
async function expectNoOtherGroups(page: Page) {
  await expect(page.getByText(OTHER_GROUP)).toHaveCount(0);
}

async function answer(page: Page, values: string[]) {
  const fields = page.getByRole('textbox');
  await expect(fields).toHaveCount(values.length);
  for (const [i, value] of values.entries()) await fields.nth(i).fill(value);
  await submitButton(page).click();
}

test.describe('US4 student (quickstart Q7, Q8, Q13)', () => {
  test('Q13: joining in each phase leads to the matching page', async ({ page }) => {
    // PREPARING → S-Wait
    await joinAfter(page, 1);
    await expect(page.getByRole('button', { name: '選錯組別？重新選擇' })).toBeVisible();
    await expect(page.getByText(`第 ${GROUP} 組`).first()).toBeVisible();
    await expectMockBadge(page);

    // OPEN(1) → S-Answer
    await joinAfter(page, 2);
    await expectAnswerPage(page, 1);

    // QUESTION_ENDED(1) → S-QuestionDone, this group submitted nothing
    await joinAfter(page, 3);
    await expect(questionResult(page)).toBeVisible();
    await expect(page.getByRole('region', { name: '本組的答案' })).toContainText('本組沒有送出');
    await expectMockBadge(page);

    // FINISHED → S-Results, this group won 0 questions
    await joinAfter(page, 9);
    await expect(page.getByText('本組搶到')).toBeVisible();
    await expect(page.getByText('0 題', { exact: true })).toBeVisible();
    await expectMockBadge(page);
  });

  test('S-Wait: choosing again returns to S-Join with the group still selected', async ({ page }) => {
    await joinAfter(page, 1);
    await page.getByRole('button', { name: '選錯組別？重新選擇' }).click();
    await expect(page.getByRole('radio', { name: new RegExp(`第 ${GROUP} 組`) })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: `加入第 ${GROUP} 組` })).toBeEnabled();
  });

  test('Q7: accepted, not accepted and a groupmate submitting', async ({ page }) => {
    await joinAfter(page, 1);
    await advance(page);

    // Question 1: submit, then "模擬：接受" → this question's result with this group as winner.
    await expectAnswerPage(page, 1);
    await expectNoOtherGroups(page);
    await expect(page.getByRole('button', { name: '模擬：同組組員送出' })).toBeVisible();
    await answer(page, ['CPU', '作業系統']);
    await expect(waiting(page)).toBeVisible();
    await expect(myAnswers(page)).toContainText('CPU');
    await expect(myAnswers(page)).toContainText('作業系統');
    await expectNoOtherGroups(page);
    await page.getByRole('button', { name: '模擬：接受' }).click();
    await expect(questionResult(page)).toContainText(`第 ${GROUP} 組`);
    await expectMockBadge(page);

    // Question 2: submit, then "模擬：不接受" → stays, cannot submit again.
    await advance(page);
    await expectAnswerPage(page, 2);
    await answer(page, ['演算法', '佇列']);
    await expect(waiting(page)).toBeVisible();
    await page.getByRole('button', { name: '模擬：不接受' }).click();
    await expect(page.getByText('老師沒有接受本組的答案')).toBeVisible();
    await expect(waiting(page)).toHaveCount(0);
    await expect(myAnswers(page)).toContainText('佇列');
    await expect(submitButton(page)).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '模擬：接受' })).toHaveCount(0);
    await expectNoOtherGroups(page);
    await advance(page);
    await expect(questionResult(page)).toContainText('沒有組別搶答成功');

    // Question 3: a groupmate submits → S-Submitted with the groupmate's answer.
    await advance(page);
    await expectAnswerPage(page, 3);
    await page.getByRole('button', { name: '模擬：同組組員送出' }).click();
    await expect(waiting(page)).toBeVisible();
    await expect(myAnswers(page)).toContainText('0');
    await expect(submitButton(page)).toHaveCount(0);
    await page.getByRole('button', { name: '模擬：接受' }).click();
    await expect(questionResult(page)).toContainText(`第 ${GROUP} 組`);

    // Question 4 (last): accepting goes straight to S-Results.
    await advance(page);
    await expectAnswerPage(page, 4);
    await answer(page, ['IP']);
    await page.getByRole('button', { name: '模擬：接受' }).click();
    await expect(page.getByText('本組搶到')).toBeVisible();
    await expect(page.getByText('3 題', { exact: true })).toBeVisible();
    await expect(questionResult(page)).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expectMockBadge(page);
  });

  test('Q7: a validation failure stays on S-Answer beside the first field', async ({ page }) => {
    await joinAfter(page, 2);
    await expectAnswerPage(page, 1);
    await page.getByRole('button', { name: '模擬：驗證失敗' }).click();
    await answer(page, ['CPU', '作業系統']);
    await expect(page.getByRole('textbox').first()).toHaveAccessibleDescription('模擬：驗證失敗');
    await expect(submitButton(page)).toBeVisible();
    await answer(page, ['CPU', '作業系統']);
    await expect(waiting(page)).toBeVisible();
  });

  test('Q8: advancing through every phase ends on S-Results, which no longer changes', async ({ page }) => {
    await joinAfter(page, 1);
    for (let n = 1; n <= 3; n += 1) {
      await advance(page);
      await expectAnswerPage(page, n);
      await advance(page);
      await expect(questionResult(page)).toContainText('沒有組別送出');
      await expectMockBadge(page);
    }
    await advance(page);
    await expectAnswerPage(page, 4);
    // The last question skips S-QuestionDone (M7).
    await advance(page);
    await expect(page.getByText('本組搶到')).toBeVisible();
    await expect(page.getByText('0 題', { exact: true })).toBeVisible();
    await expect(questionResult(page)).toHaveCount(0);
    // FINISHED is final: S-Results has no advance control (FR-061).
    await expect(page.getByRole('button', { name: '模擬：推進到下一個階段' })).toHaveCount(0);
    await expectMockBadge(page);
  });
});
