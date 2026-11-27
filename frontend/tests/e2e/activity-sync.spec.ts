// 004 activity sync across tabs (tasks T028, T044, T050). Pages are 001's and are not changed by 004.
import { expect, test, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test';
import { GROUP_COUNT_MAX, GROUP_COUNT_MIN, JOIN_METHOD_TEXT, WAIT_ROUND_TEXT } from '@quiz-buzzer/shared/activityRules';
import { signInAsPageTeacher } from './googleSignIn';
import { advanceActivity, bypassGroupCountOnce, connectTestServer, socketFramesOf } from './testServer';
import { endQuestion, errorArea, expectOn, pick, SHEET_OK, STUDENT_ACTIVITY, toLobby, toSetup, type PageId } from './us5-walk';

test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

const groupField = (page: Page) => page.getByRole('group', { name: '組數' });
const stepButton = (page: Page, name: '−' | '+') => groupField(page).getByRole('button', { name, exact: true });

test.describe('T028 活動設定頁 (AC-01, AC-02, AC-04)', () => {
  test('starts at 6 groups (AC-01)', async ({ page }) => {
    await toSetup(page);
    await expect(groupField(page)).toContainText('6 組');
  });

  // The page stops at 2 (001 C2), so the request is rewritten to 1 groups, bypassing the page.
  test('refuses an out-of-range group count and shows why next to the field (AC-04)', async ({ page }) => {
    await toSetup(page);
    await bypassGroupCountOnce(page, 1);
    await page.getByRole('button', { name: '建立活動' }).click();
    await expect(groupField(page)).toContainText('組數必須是 2 到 20 之間的整數');
    await expectOn(page, 'T-Setup');
  });

  test('disables "−" at 2 and "+" at 20, and shows the join method text (AC-01, AC-02)', async ({ page }) => {
    await toSetup(page);
    for (let n = 6; n > GROUP_COUNT_MIN; n -= 1) await stepButton(page, '−').click();
    await expect(stepButton(page, '−')).toBeDisabled();
    for (let n = GROUP_COUNT_MIN; n < GROUP_COUNT_MAX; n += 1) await stepButton(page, '+').click();
    await expect(stepButton(page, '+')).toBeDisabled();
    await expect(page.getByRole('region', { name: '這一輪' })).toContainText(JOIN_METHOD_TEXT);
  });
});

// ----- T044: 1 teacher and student tabs follow every phase (AC-09, AC-12, AC-14–20, AC-33, AC-34) -----

/** Phase changes reach every tab within 1 second (SC-001). */
const PHASE_MS = 1000;
const QUESTIONS = 4;

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

/** A student tab in its own browser context, talking to this test's server. */
async function studentTab(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await connectTestServer(page);
  return page;
}

/** Main → "我是學生" (S-Join, with or without an activity). */
async function openJoin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /我是學生/ }).click();
}

async function joinGroup(page: Page, group: number) {
  await page.getByRole('radio', { name: new RegExp(`第 ${group} 組`) }).click();
  await page.getByRole('button', { name: `加入第 ${group} 組` }).click();
}

/** `id` is shown within 1 second (SC-001), without reloading the tab. */
async function expectSoonOn(page: Page, id: PageId) {
  await expect(async () => expectOn(page, id)).toPass({ timeout: PHASE_MS });
}

const questionLabel = (page: Page, n: number) => page.getByText(`第 ${n} 題 / 共 ${QUESTIONS} 題`);
const groupCell = (page: Page, n: number) => page.getByRole('list', { name: '組別' }).getByRole('listitem').filter({ hasText: `第 ${n} 組` });

test.describe('T044 活動同步 (AC-15, AC-17–20, SC-001, SC-004)', () => {
  test('a teacher and 3 students go from creating to FINISHED without reloading', async ({ page, browser }) => {
    const students = [await studentTab(browser), await studentTab(browser), await studentTab(browser)];
    for (const student of students) {
      await openJoin(student);
      await expectOn(student, 'S-JoinEmpty');
    }

    await toLobby(page);
    // AC-15: the open S-Join tabs list the groups once the activity exists.
    for (const student of students) await expectSoonOn(student, 'S-Join');
    for (const [i, student] of students.entries()) {
      await joinGroup(student, i + 1);
      await expectOn(student, 'S-Wait');
    }
    for (const n of [1, 2, 3]) await expect(groupCell(page, n)).toContainText('已加入 1 人', { timeout: PHASE_MS });

    for (let n = 1; n <= QUESTIONS; n += 1) {
      await page.getByRole('button', { name: `開放第 ${n} 題` }).click();
      await expectOn(page, 'T-Live');
      for (const student of students) {
        await expectSoonOn(student, 'S-Answer');
        await expect(questionLabel(student, n)).toBeVisible();
      }

      await endQuestion(page);
      const last = n === QUESTIONS;
      await expectOn(page, last ? 'T-Results' : 'T-QuestionEnd');
      // AC-20: the last question goes straight to S-Results.
      for (const student of students) await expectSoonOn(student, last ? 'S-Results' : 'S-QuestionDone');
    }
  });

  test('a tab joining after a question ended or after FINISHED lands on that phase (001 RD-14)', async ({ page }) => {
    // PREPARING → OPEN(1) → QUESTION_ENDED(1)
    for (let step = 0; step < 3; step += 1) await advanceActivity(STUDENT_ACTIVITY);
    await openJoin(page);
    await joinGroup(page, 2);
    await expectOn(page, 'S-QuestionDone');

    const late = await studentTab(page.context().browser()!);
    // … OPEN(4) → FINISHED
    for (let step = 0; step < 2 * QUESTIONS - 2; step += 1) await advanceActivity(STUDENT_ACTIVITY);
    await openJoin(late);
    await joinGroup(late, 4);
    await expectOn(late, 'S-Results');
  });

  test('student tabs get no spreadsheet details and use WebSocket only (AC-16, REQ-ACT-20, SC-003)', async ({ page }) => {
    const polling: Request[] = [];
    page.on('request', (request) => {
      if (request.url().includes('transport=polling')) polling.push(request);
    });
    await openJoin(page);
    await advanceActivity(STUDENT_ACTIVITY);
    await joinGroup(page, 3);
    await expectOn(page, 'S-Wait');
    await advanceActivity(STUDENT_ACTIVITY);
    await expectSoonOn(page, 'S-Answer');

    const snapshots = socketFramesOf(page.context()).filter((frame) => frame.includes('"activity"'));
    expect(snapshots.length).toBeGreaterThan(0);
    const all = snapshots.join('\n');
    expect(all).not.toContain(STUDENT_ACTIVITY.spreadsheet.id);
    expect(all).not.toContain(STUDENT_ACTIVITY.spreadsheet.title);
    expect(all).toContain('"spreadsheet":{"id":"","title":""');
    expect(polling).toEqual([]);
  });
});

test.describe('T044 取消活動 (AC-33, AC-34, SC-007)', () => {
  test('cancelling while PREPARING empties every student tab, and a new activity starts from 0', async ({ page, browser }) => {
    const waiting = await studentTab(browser);
    const choosing = await studentTab(browser);
    const home = await studentTab(browser);

    await toLobby(page);
    await openJoin(waiting);
    await joinGroup(waiting, 3);
    await expectOn(waiting, 'S-Wait');
    await openJoin(choosing);
    await choosing.getByRole('radio', { name: /第 1 組/ }).click();
    await home.goto('/');
    await expect(home.getByText('準備中')).toBeVisible();

    await page.getByRole('button', { name: '取消活動' }).click();
    await page.getByRole('dialog', { name: '取消活動？' }).getByRole('button', { name: '確定取消活動' }).click();
    await expectOn(page, 'T-Pick');

    await expectSoonOn(waiting, 'S-JoinEmpty');
    await expectSoonOn(choosing, 'S-JoinEmpty');
    await expect(home.getByText('目前沒有活動', { exact: true })).toBeVisible({ timeout: PHASE_MS });

    // AC-34: create again; every group starts from 0 and the old choice is gone.
    await pick(page, '從 Google 雲端硬碟挑選', SHEET_OK);
    await expectOn(page, 'T-Import');
    await page.getByRole('button', { name: '確認匯入，下一步' }).click();
    await page.getByRole('button', { name: '建立活動' }).click();
    await expectOn(page, 'T-Lobby');
    for (let n = 1; n <= 6; n += 1) await expect(groupCell(page, n)).toContainText('還沒有人');

    await expectSoonOn(choosing, 'S-Join');
    await expect(choosing.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(choosing.getByRole('button', { name: '加入組別' })).toBeDisabled();

    await expectSoonOn(waiting, 'S-Join');
    await joinGroup(waiting, 1);
    await expectOn(waiting, 'S-Wait');
    await expect(groupCell(page, 1)).toContainText('已加入 1 人', { timeout: PHASE_MS });
    await expect(groupCell(page, 3)).toContainText('還沒有人');
  });
});

test.describe('T044 第 1 題開放後 (AC-12, AC-14)', () => {
  test('the console has no 取消活動, and a refreshed student can only go back to group 3', async ({ page, browser }) => {
    const student = await studentTab(browser);
    await toLobby(page);
    await openJoin(student);
    await joinGroup(student, 3);
    await expectOn(student, 'S-Wait');

    await page.getByRole('button', { name: '開放第 1 題' }).click();
    await expectOn(page, 'T-Live');
    await expect(page.getByRole('button', { name: '取消活動' })).toHaveCount(0);
    await expectSoonOn(student, 'S-Answer');

    await student.reload();
    await openJoin(student);
    await joinGroup(student, 5);
    await expect(errorArea(student)).toHaveText('第 1 題開放後不能換組，你在第 3 組');
    await expectOn(student, 'S-Join');

    await joinGroup(student, 3);
    await expectOn(student, 'S-Answer');
    await expect(questionLabel(student, 1)).toBeVisible();
  });

  test('S-Wait shows the round text under the question count (AC-09)', async ({ page }) => {
    await openJoin(page);
    await advanceActivity(STUDENT_ACTIVITY);
    await joinGroup(page, 3);
    await expectOn(page, 'S-Wait');
    await expect(page.getByRole('region', { name: '這一輪' })).toContainText(WAIT_ROUND_TEXT);
  });
});

// ----- T050: the teacher reloads or is replaced; the activity goes on (AC-25–27, AC-32, SC-005) -----

const liveHeading = (page: Page, n: number) => page.getByRole('heading', { level: 1, name: `第 ${n} 題 / 共 ${QUESTIONS} 題` });

/** Main → "我是老師" → "用 Google 登入" as the page teacher (002's test double). */
async function signInFromHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /我是老師/ }).click();
  await expectOn(page, 'T-Login');
  await signInAsPageTeacher(page);
}

/** The teacher page on T-Live (第 2 題) with one student of group 3 on S-Answer (第 2 題). */
async function toQuestion2(page: Page, browser: Browser): Promise<Page> {
  const student = await studentTab(browser);
  await toLobby(page);
  await openJoin(student);
  await joinGroup(student, 3);
  await expectOn(student, 'S-Wait');
  await page.getByRole('button', { name: '開放第 1 題' }).click();
  await expectOn(page, 'T-Live');
  await endQuestion(page);
  await expectOn(page, 'T-QuestionEnd');
  await page.getByRole('button', { name: '開放第 2 題' }).click();
  await expect(liveHeading(page, 2)).toBeVisible();
  await expectSoonOn(student, 'S-Answer');
  await expect(questionLabel(student, 2)).toBeVisible();
  return student;
}

test.describe('T050 老師重新整理後回到控制台 (AC-25, AC-26, SC-005)', () => {
  test('a teacher who reloads during question 2 signs in again straight to T-Live (第 2 題); the student is unaffected', async ({ page, browser }) => {
    const student = await toQuestion2(page, browser);

    await page.reload();
    await expectOn(page, 'Main');
    // AC-25: the student tab stays on question 2 while the teacher is away.
    await expectOn(student, 'S-Answer');
    await expect(questionLabel(student, 2)).toBeVisible();

    await signInFromHome(page);
    await expectOn(page, 'T-Live');
    await expect(liveHeading(page, 2)).toBeVisible();
    await expectOn(student, 'S-Answer');

    // The console is really back in control: ending question 2 reaches the student (SC-005).
    await endQuestion(page);
    await expectOn(page, 'T-QuestionEnd');
    await expectSoonOn(student, 'S-QuestionDone');
  });

  for (const { phase, steps, lands } of [
    { phase: 'PREPARING', steps: 1, lands: 'T-Lobby' },
    { phase: 'QUESTION_ENDED (第 1 題)', steps: 3, lands: 'T-QuestionEnd' },
    { phase: 'FINISHED', steps: 1 + 2 * QUESTIONS, lands: 'T-Results' },
  ] as const) {
    test(`signing in while the activity is ${phase} lands on ${lands} (AC-26)`, async ({ page }) => {
      for (let i = 0; i < steps; i += 1) await advanceActivity(STUDENT_ACTIVITY);
      await signInFromHome(page);
      await expectOn(page, lands);
      if (lands === 'T-QuestionEnd') await expect(page.getByRole('heading', { level: 1, name: '第 1 題已結束' })).toBeVisible();
    });
  }

  test('signing in with no activity lands on T-Pick (AC-27)', async ({ page }) => {
    await signInFromHome(page);
    await expectOn(page, 'T-Pick');
  });
});

test.describe('T050 另一個分頁登入取代老師 (AC-32)', () => {
  test('a sign-in in another browser during question 2 lands on T-Live (第 2 題); the student is unaffected', async ({ page, browser }) => {
    const student = await toQuestion2(page, browser);
    const context = await browser.newContext();
    contexts.push(context);
    const other = await context.newPage();
    await connectTestServer(other);

    await signInFromHome(other);
    await expectOn(other, 'T-Live');
    await expect(liveHeading(other, 2)).toBeVisible();
    await expectOn(student, 'S-Answer');
    await expect(questionLabel(student, 2)).toBeVisible();

    await endQuestion(other);
    await expectOn(other, 'T-QuestionEnd');
    await expectSoonOn(student, 'S-QuestionDone');
  });
});
