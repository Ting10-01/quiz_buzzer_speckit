// 005 T032: quickstart manual scenarios 1–7 and 9 (and 10's UNJUDGED) with 1 teacher tab and 4 student
// tabs, on 001's pages as they are. Student tabs are in their own browser contexts so their
// WebSocket frames can be checked apart (AC-17, AC-18).
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Submission } from '@quiz-buzzer/shared/entities';
import { connectTestServer, socketFramesOf, teacherApi } from './testServer';
import { endQuestion, expectOn, toLobby, type PageId } from './us5-walk';

/** Phase changes after "接受" reach every tab within 1 second (AC-12, SC-005). */
const PHASE_MS = 1000;

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

async function studentTab(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await connectTestServer(page);
  return page;
}

/** Main → "我是學生" → `group` → "加入第 n 組". */
async function joinGroup(page: Page, group: number) {
  await page.goto('/');
  await page.getByRole('button', { name: /我是學生/ }).click();
  await page.getByRole('radio', { name: new RegExp(`第 ${group} 組`) }).click();
  await page.getByRole('button', { name: `加入第 ${group} 組` }).click();
}

async function expectSoonOn(page: Page, id: PageId) {
  await expect(async () => expectOn(page, id)).toPass({ timeout: PHASE_MS });
}

const fields = (page: Page) => page.getByRole('textbox');
const submitButton = (page: Page) => page.getByRole('button', { name: '整組送出', exact: true });

/** Fills every field with `prefix1`, `prefix2`, … */
async function fill(page: Page, prefix: string) {
  const count = await fields(page).count();
  for (let i = 0; i < count; i += 1) await fields(page).nth(i).fill(`${prefix}${i + 1}`);
}

const answerRows = (page: Page) =>
  page.getByRole('table', { name: '答案列表' }).getByRole('row').filter({ has: page.getByRole('button') });
const rowOf = (page: Page, group: number) => answerRows(page).filter({ hasText: `第 ${group} 組` });

async function expectJudgeable(page: Page, group: number, enabled: boolean) {
  for (const name of ['接受', '不接受']) {
    const button = rowOf(page, group).getByRole('button', { name, exact: true });
    await (enabled ? expect(button).toBeEnabled() : expect(button).toBeDisabled());
  }
}

const sentAnswers = (page: Page) => page.getByRole('region', { name: '本組送出的答案' });

/** Every `"rank":<n>` in the frames a browser context received. */
function ranksIn(frames: string[]): number[] {
  return [...frames.join('\n').matchAll(/"rank":(\d+)/g)].map((match) => Number(match[1]));
}

test.describe('T032 搶答與判定 (quickstart 1–10)', () => {
  test('a teacher and 4 students submit, judge in order and end questions', async ({ page, browser }) => {
    // Five tabs and two questions: under a loaded full-suite run this can pass 30 s, so triple the limit.
    test.slow();
    const [a, b, c] = [await studentTab(browser), await studentTab(browser), await studentTab(browser)];

    await toLobby(page);
    await joinGroup(a, 1);
    await joinGroup(b, 1);
    await joinGroup(c, 2);
    for (const student of [a, b, c]) await expectOn(student, 'S-Wait');
    await page.getByRole('button', { name: '開放第 1 題' }).click();
    await expectOn(page, 'T-Live');
    for (const student of [a, b, c]) await expectSoonOn(student, 'S-Answer');

    // 1 (AC-02): the blank cell says why; what was typed stays.
    await expect(fields(a)).toHaveCount(2);
    await fields(a).first().fill('只填一格');
    await submitButton(a).click();
    await expect(fields(a).nth(1)).toHaveAccessibleDescription('每一格都填才能送出');
    await expect(fields(a).first()).toHaveValue('只填一格');
    await expectOn(a, 'S-Answer');

    // 2 (AC-04, AC-27): A and B submit at once; both wait on the answer processed first.
    await fill(a, 'A');
    await fill(b, 'B');
    // Whichever lands first moves the other tab to waiting (AC-27), so the other click may find no button.
    const clicks = await Promise.allSettled([a, b].map((tab) => submitButton(tab).click({ timeout: PHASE_MS })));
    expect(clicks.some((click) => click.status === 'fulfilled')).toBe(true);
    await expectSoonOn(a, 'S-Submitted');
    await expectSoonOn(b, 'S-Submitted');
    await expect(answerRows(page)).toHaveCount(1);
    const firstAnswers = (await sentAnswers(a).locator('p').textContent()) ?? '';
    expect(['（1）A1　（2）A2', '（1）B1　（2）B2']).toContain(firstAnswers);
    await expect(sentAnswers(b)).toContainText(firstAnswers);
    await expect(rowOf(page, 1)).toContainText(firstAnswers);

    // 3 (AC-03, AC-09): #1 group 1, #2 group 2, each with both answers and the time since opening.
    await fill(c, 'C');
    await submitButton(c).click();
    await expectSoonOn(c, 'S-Submitted');
    await expect(answerRows(page)).toHaveCount(2);
    await expect(answerRows(page).nth(0)).toContainText('#1');
    await expect(answerRows(page).nth(0)).toContainText('第 1 組');
    await expect(answerRows(page).nth(1)).toContainText('#2');
    await expect(answerRows(page).nth(1)).toContainText('第 2 組');
    await expect(answerRows(page).nth(1)).toContainText('（1）C1　（2）C2');
    for (const row of [answerRows(page).nth(0), answerRows(page).nth(1)]) await expect(row).toContainText(/\d+\.\d{3} 秒/);

    // 4 (AC-28): a new tab joining group 1 goes straight to waiting.
    const d = await studentTab(browser);
    await joinGroup(d, 1);
    await expectOn(d, 'S-Submitted');
    await expect(sentAnswers(d)).toContainText(firstAnswers);

    // 5 (AC-10): only #1 can be judged.
    await expectJudgeable(page, 1, true);
    await expectJudgeable(page, 2, false);

    // 6 (AC-08, AC-11): "不接受" keeps the question open; group 1 stays rejected with no submit button.
    await rowOf(page, 1).getByRole('button', { name: '不接受', exact: true }).click();
    await expect(rowOf(page, 1)).toContainText('不接受');
    await expectOn(page, 'T-Live');
    for (const student of [a, b, d]) await expectSoonOn(student, 'S-Rejected');
    await expectOn(c, 'S-Submitted');
    await expectJudgeable(page, 2, true);

    // 7 (AC-28): a tab joining group 1 after the rejection goes straight to the rejected view. D is
    // loaded again from Main and joins anew, so the task keeps to 4 student tabs.
    await joinGroup(d, 1);
    await expectOn(d, 'S-Rejected');
    await expect(sentAnswers(d)).toContainText(firstAnswers);

    // 9 (AC-12): "接受" ends the question; every tab moves within 1 second.
    await rowOf(page, 2).getByRole('button', { name: '接受', exact: true }).click();
    await expectSoonOn(page, 'T-QuestionEnd');
    for (const student of [a, b, c, d]) await expectSoonOn(student, 'S-QuestionDone');

    // 10 (AC-14): question 2 ended by hand leaves group 1's submission UNJUDGED.
    await page.getByRole('button', { name: '開放第 2 題' }).click();
    await expectOn(page, 'T-Live');
    await expectSoonOn(a, 'S-Answer');
    await fill(a, 'Q2-');
    await submitButton(a).click();
    await expectSoonOn(a, 'S-Submitted');
    await expect(answerRows(page)).toHaveCount(1);
    await endQuestion(page);
    await expectOn(page, 'T-QuestionEnd');
    for (const student of [a, b, c, d]) {
      await expectSoonOn(student, 'S-QuestionDone');
      await expect(submitButton(student)).toHaveCount(0);
    }

    // AC-17, AC-18: no student tab got another group's answers, and every rank it got is 0.
    const groupOneAnswers = ['A1', 'A2', 'B1', 'B2', 'Q2-1', 'Q2-2'];
    const cFrames = socketFramesOf(c.context());
    expect(ranksIn(cFrames).length).toBeGreaterThan(0);
    for (const answer of groupOneAnswers) expect(cFrames.join('\n')).not.toContain(`"${answer}"`);
    for (const student of [a, b, d]) expect(socketFramesOf(student.context()).join('\n')).not.toContain('"C1"');
    for (const student of [a, b, c, d]) expect(ranksIn(socketFramesOf(student.context())).every((rank) => rank === 0)).toBe(true);

    // Last: signing in the walk teacher voids the teacher page's credential.
    const submissions = await teacherApi<Submission[]>('GET', '/api/questions/2/submissions');
    expect(submissions.map((s) => [s.groupNumber, s.judgement])).toEqual([[1, 'UNJUDGED']]);
  });
});
