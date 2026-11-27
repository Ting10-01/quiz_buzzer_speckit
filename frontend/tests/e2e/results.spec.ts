// 006 T032: results and write-back on 001's pages, with 1 teacher tab and a group 5 student tab in its
// own browser context; other groups submit through the test server, whose Google Sheets is a fake
// (server/tests/e2e/startTestServer.ts).
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { connectTestServer, groupmateSubmits, socketFramesOf, writtenToSheet } from './testServer';
import { SHEET_SINGLE, endQuestion, expectOn, toLive, toLobby } from './us5-walk';

const STUDENT_GROUP = 5;

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

/** A group 5 tab in its own browser context, so its WebSocket frames can be checked apart. */
async function studentTab(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await connectTestServer(page);
  await page.goto('/');
  await page.getByRole('button', { name: /我是學生/ }).click();
  await page.getByRole('radio', { name: new RegExp(`第 ${STUDENT_GROUP} 組`) }).click();
  await page.getByRole('button', { name: `加入第 ${STUDENT_GROUP} 組` }).click();
  await expectOn(page, 'S-Wait');
  return page;
}

async function studentSubmits(page: Page, answers: string[]) {
  await expectOn(page, 'S-Answer');
  const fields = page.getByRole('textbox');
  await expect(fields).toHaveCount(answers.length);
  for (const [i, answer] of answers.entries()) await fields.nth(i).fill(answer);
  await page.getByRole('button', { name: '整組送出', exact: true }).click();
  await expectOn(page, 'S-Submitted');
}

const rowOf = (page: Page, group: number) =>
  page.getByRole('table', { name: '答案列表' }).getByRole('row').filter({ hasText: `第 ${group} 組` });

/** The teacher judges on T-Live, waiting until the server has the submission. */
async function judge(page: Page, group: number, name: '接受' | '不接受') {
  await rowOf(page, group).getByRole('button', { name, exact: true }).click();
}

async function openQuestion(page: Page, n: number) {
  await page.getByRole('button', { name: `開放第 ${n} 題` }).click();
  await expectOn(page, 'T-Live');
}

const questionResult = (page: Page) => page.getByRole('region', { name: '本題結果' });
/** "本題已送出" on T-QuestionEnd and S-QuestionDone. */
const submittedCount = (page: Page) => page.locator('dt:text-is("本題已送出") + dd');
const progressItem = (page: Page, n: number) =>
  page.getByRole('list', { name: '題目進度' }).getByRole('listitem').filter({ hasText: `第 ${n} 題` });
const questionCard = (page: Page, n: number) => page.getByRole('region', { name: `第 ${n} 題` });
const writeBackDialog = (page: Page) => page.getByRole('dialog', { name: /寫回 Google Sheets/ });

test.describe('T032 results and write-back', () => {
  test('a question result, all results and a successful write-back', async ({ page, browser }) => {
    await toLobby(page);
    const student = await studentTab(browser);

    // Question 1: group 3 wins.
    await openQuestion(page, 1);
    await groupmateSubmits(3, ['CPU', '作業系統']);
    await judge(page, 3, '接受');
    await expectOn(page, 'T-QuestionEnd');
    await expectOn(student, 'S-QuestionDone');

    // Question 2: groups 1 and 5 are rejected, then group 2 wins.
    await openQuestion(page, 2);
    await groupmateSubmits(1, ['流程圖', '佇列']);
    await studentSubmits(student, ['演算法', '佇列']);
    await groupmateSubmits(2, ['演算法', '堆疊']);
    await expect(rowOf(page, 2)).toBeVisible();
    await judge(page, 1, '不接受');
    await judge(page, 5, '不接受');
    await judge(page, 2, '接受');

    // AC-01, AC-02: the teacher and group 5 see the winner and its answers; group 5 also sees its own
    // rejected submission and nothing of group 1 (AC-10, SC-006).
    await expectOn(page, 'T-QuestionEnd');
    await expect(questionResult(page)).toContainText('第 2 組');
    await expect(questionResult(page)).toContainText('演算法');
    await expect(questionResult(page)).toContainText('堆疊');
    await expect(submittedCount(page)).toHaveText('3 組');
    await expectOn(student, 'S-QuestionDone');
    await expect(questionResult(student)).toContainText('第 2 組');
    await expect(questionResult(student)).toContainText('堆疊');
    await expect(submittedCount(student)).toHaveText('3 組');
    await expect(student.getByRole('region', { name: '本組的答案' })).toContainText('佇列');
    await expect(student.getByRole('main')).not.toContainText('流程圖');
    // 001's S-QuestionDone shows only the answers (FR-057); the judgement is in the result it got.
    const studentFrames = () => socketFramesOf(student.context()).join('\n');
    expect(studentFrames()).toMatch(/"groupNumber":5,"answers":\["演算法","佇列"\],"rank":0,"elapsedMs":\d+,"judgement":"REJECTED"/);
    // The progress has only the ended questions' results.
    await expect(progressItem(student, 1)).toContainText('第 3 組');
    await expect(progressItem(student, 2)).toContainText('第 2 組');
    await expect(progressItem(student, 3)).toContainText('還沒開放');
    expect(studentFrames()).not.toContain('"流程圖"');

    // Question 3: nobody submits. Question 4 (last): group 5 wins, which finishes the activity.
    await openQuestion(page, 3);
    await endQuestion(page);
    await expectOn(page, 'T-QuestionEnd');
    await openQuestion(page, 4);
    await studentSubmits(student, ['IP']);
    await groupmateSubmits(2, ['MAC']);
    await expect(rowOf(page, 2)).toBeVisible();
    await judge(page, 5, '接受');

    // AC-08, AC-30: the teacher sees every submission and the seconds behind the first one.
    await expectOn(page, 'T-Results');
    const q2 = questionCard(page, 2);
    await expect(q2.getByRole('row')).toHaveCount(4);
    for (const group of [1, 5, 2]) await expect(q2).toContainText(`第 ${group} 組`);
    await expect(q2.getByText(/^慢 \d+\.\d{3} 秒$/)).toHaveCount(2);

    // AC-07: after the activity group 5 sees every submission of each question and its win count.
    await expectOn(student, 'S-Results');
    await expect(student.getByText('1 題', { exact: true })).toBeVisible();
    const studentQ2 = questionCard(student, 2);
    for (const answer of ['流程圖', '堆疊', '演算法']) await expect(studentQ2).toContainText(answer);
    await expect(questionCard(student, 4)).toContainText('MAC');

    // AC-11, REQ-RES-19: the confirmation says the cells are overwritten and nothing about a backup.
    await page.getByRole('button', { name: '寫回 Google Sheets' }).click();
    await expect(writeBackDialog(page)).toContainText('這些填空格原本的內容會被覆蓋。');
    await expect(writeBackDialog(page)).not.toContainText('備份');

    // REQ-RES-20: success with the cell count; questions 1, 2 and 4 go to their blank cells.
    await writeBackDialog(page).getByRole('button', { name: '寫回', exact: true }).click();
    await expect(writeBackDialog(page)).toContainText('寫回成功：已寫入 5 格');
    const writes = await writtenToSheet();
    expect(writes.map((w) => w.method)).toEqual(['duplicateSheet', 'writeTexts']);
    expect(writes[1]!.cells).toEqual([
      { cell: 'G5', text: 'CPU' },
      { cell: 'G6', text: '作業系統' },
      { cell: 'G8', text: '演算法' },
      { cell: 'G9', text: '堆疊' },
      { cell: 'G13', text: 'IP' },
    ]);
  });

  test('a failed write-back shows the reason and writes nothing', async ({ page }) => {
    // 單題範本 is read-only on the test server, like 001's mock (M8).
    await toLive(page, SHEET_SINGLE);
    await groupmateSubmits(1);
    await judge(page, 1, '接受');
    for (let n = 2; n <= 6; n += 1) {
      await openQuestion(page, n);
      await endQuestion(page);
    }
    await expectOn(page, 'T-Results');

    await page.getByRole('button', { name: '寫回 Google Sheets' }).click();
    await writeBackDialog(page).getByRole('button', { name: '寫回', exact: true }).click();
    await expect(writeBackDialog(page)).toContainText(
      '寫回失敗：沒有編輯權限，無法寫回。請改用可以編輯這份試算表的帳號。沒有寫入任何格子。',
    );
    await writeBackDialog(page).getByRole('button', { name: '關閉' }).click();
    await expect(page.getByRole('main')).toContainText('寫回失敗');
    expect(await writtenToSheet()).toEqual([]);
  });
});
