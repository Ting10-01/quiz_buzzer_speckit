// Shared page checks and walks for the US5 specs (T093–T096). Not a spec file itself:
// Playwright only collects *.spec.ts.
import { expect, type Page } from '@playwright/test';
import { pickerWill } from './googlePicker';
import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import { MockFixtures } from '../../src/services/mock/MockFixtures';
import { signInAsPageTeacher } from './googleSignIn';
import { advanceActivity, connectTestServer, resetTestServer } from './testServer';

export type PageId =
  | 'Main'
  | 'T-Login'
  | 'T-Pick'
  | 'T-Import'
  | 'T-ImportError'
  | 'T-Setup'
  | 'T-Lobby'
  | 'T-Live'
  | 'T-QuestionEnd'
  | 'T-Results'
  | 'S-JoinEmpty'
  | 'S-Join'
  | 'S-Wait'
  | 'S-Answer'
  | 'S-Submitted'
  | 'S-Rejected'
  | 'S-QuestionDone'
  | 'S-Results';

export const GROUP = 3;
export const SHEET_OK = '題組＋單題範本';
export const SHEET_SINGLE = '單題範本';
export const SHEET_BAD = '表頭錯誤範例';
/** Questions in the mock activity seen by the home page and student pages (M3, M7). */
export const STUDENT_QUESTIONS = 4;

const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

export const mockBar = (page: Page) => page.getByRole('group', { name: '模擬控制列' });
export const errorArea = (page: Page) => page.getByRole('alert');

/** Asserts the page currently shown is `id`, and that the "模擬模式" label is visible (SC-003). */
export async function expectOn(page: Page, id: PageId) {
  switch (id) {
    case 'Main':
      await expect(heading(page, '課堂搶答')).toBeVisible();
      break;
    case 'T-Login':
      await expect(heading(page, '老師登入')).toBeVisible();
      break;
    case 'T-Pick':
      await expect(heading(page, '從 Google 雲端硬碟匯入學習單')).toBeVisible();
      break;
    case 'T-Import':
      await expect(heading(page, '確認辨識結果')).toBeVisible();
      break;
    case 'T-ImportError':
      await expect(heading(page, '找不到表頭，無法匯入')).toBeVisible();
      break;
    case 'T-Setup':
      await expect(heading(page, '活動設定')).toBeVisible();
      break;
    case 'T-Lobby':
      await expect(heading(page, '等學生加入')).toBeVisible();
      break;
    case 'T-Live':
      await expect(button(page, '結束這一題')).toBeVisible();
      break;
    case 'T-QuestionEnd':
      await expect(heading(page, /^第 \d+ 題已結束$/)).toBeVisible();
      await expect(button(page, /^開放第 \d+ 題$/)).toBeVisible();
      break;
    case 'T-Results':
      await expect(heading(page, '搶答結果')).toBeVisible();
      break;
    case 'S-JoinEmpty':
      await expect(page.getByText('目前沒有活動，請等老師建立活動')).toBeVisible();
      break;
    case 'S-Join':
      await expect(heading(page, '選擇你的組別')).toBeVisible();
      break;
    case 'S-Wait':
      await expect(heading(page, '等老師開放第 1 題')).toBeVisible();
      break;
    case 'S-Answer':
      await expect(button(page, '整組送出')).toBeVisible();
      break;
    case 'S-Submitted':
      await expect(page.getByText('等待老師判定')).toBeVisible();
      break;
    case 'S-Rejected':
      await expect(page.getByText('老師沒有接受本組的答案')).toBeVisible();
      await expect(button(page, '整組送出')).toHaveCount(0);
      break;
    case 'S-QuestionDone':
      await expect(heading(page, /^第 \d+ 題已結束$/)).toBeVisible();
      await expect(page.getByRole('region', { name: '本組的答案' })).toBeVisible();
      break;
    case 'S-Results':
      await expect(heading(page, '全部結果')).toBeVisible();
      break;
  }
  await expect(page.getByText('模擬模式', { exact: true })).toBeVisible();
}

/** The activity the student walks advance through: 001's fixed student activity (M3, M7). */
export const STUDENT_ACTIVITY: ImportSuccess = {
  spreadsheet: MockFixtures.activity.spreadsheet,
  headerRow: 4,
  headerColumns: ['B', 'C', 'G'],
  questions: MockFixtures.activity.questions,
};

/**
 * Advances the phase seen by the home page and student pages one step at a time, like 001's mock
 * M7: the walk teacher calls the test server's teacher API, without opening a teacher page (004 T061).
 */
export async function advance(page: Page, times = 1) {
  void page;
  for (let i = 0; i < times; i += 1) await advanceActivity(STUDENT_ACTIVITY);
}

/** Clicks `name` and picks `sheet` in the stubbed Google Picker (googlePicker.ts). */
export async function pick(page: Page, name: string, sheet: string) {
  await pickerWill(page, sheet);
  await button(page, name).click();
}

// ----- teacher walks -----

export async function toLogin(page: Page) {
  await connectTestServer(page);
  await page.goto('/');
  await button(page, /我是老師/).click();
  await expectOn(page, 'T-Login');
}

export async function toPick(page: Page) {
  await toLogin(page);
  await signInAsPageTeacher(page);
  await expectOn(page, 'T-Pick');
}

export async function toImport(page: Page, sheet = SHEET_OK) {
  await toPick(page);
  await pick(page, '從 Google 雲端硬碟挑選', sheet);
  await expectOn(page, 'T-Import');
}

export async function toImportError(page: Page) {
  await toPick(page);
  await pick(page, '從 Google 雲端硬碟挑選', SHEET_BAD);
  await expectOn(page, 'T-ImportError');
}

export async function toSetup(page: Page, sheet = SHEET_OK) {
  await toImport(page, sheet);
  await button(page, '確認匯入，下一步').click();
  await expectOn(page, 'T-Setup');
}

export async function toLobby(page: Page, sheet = SHEET_OK) {
  await toSetup(page, sheet);
  await button(page, '建立活動').click();
  await expectOn(page, 'T-Lobby');
}

export async function toLive(page: Page, sheet = SHEET_OK) {
  await toLobby(page, sheet);
  await button(page, '開放第 1 題').click();
  await expectOn(page, 'T-Live');
}

/** On T-Live: "結束這一題" → "結束並公布結果". */
export async function endQuestion(page: Page) {
  await button(page, '結束這一題').click();
  await page.getByRole('dialog', { name: /結束第 \d+ 題/ }).getByRole('button', { name: '結束並公布結果' }).click();
}

export async function toQuestionEnd(page: Page) {
  await toLive(page);
  await endQuestion(page);
  await expectOn(page, 'T-QuestionEnd');
}

/** Opens and ends every question of `sheet` (題組＋單題範本: 4) to reach T-Results. */
export async function toResults(page: Page, sheet = SHEET_OK, questions = 4) {
  await toLive(page, sheet);
  for (let n = 1; n <= questions; n += 1) {
    if (n > 1) {
      await button(page, `開放第 ${n} 題`).click();
      await expectOn(page, 'T-Live');
    }
    await endQuestion(page);
  }
  await expectOn(page, 'T-Results');
}

// ----- student walks -----

/** Main → S-Join, advancing `steps` times on S-Join (M7) first. */
export async function toJoin(page: Page, steps = 0) {
  await connectTestServer(page);
  // Each student walk starts from no activity, as the 001 mock did on every page load.
  await resetTestServer();
  await page.goto('/');
  await button(page, /我是學生/).click();
  await expectOn(page, 'S-JoinEmpty');
  await advance(page, steps);
}

/** S-Join → selects GROUP → "加入第 GROUP 組". */
export async function join(page: Page) {
  await page.getByRole('radio', { name: new RegExp(`第 ${GROUP} 組`) }).click();
  await button(page, `加入第 ${GROUP} 組`).click();
}

export async function toWait(page: Page) {
  await toJoin(page, 1);
  await join(page);
  await expectOn(page, 'S-Wait');
}

export async function toAnswer(page: Page) {
  await toWait(page);
  await advance(page);
  await expectOn(page, 'S-Answer');
}

/** Fills every answer field on S-Answer and clicks "整組送出". */
export async function submit(page: Page, value = '答案') {
  const fields = page.getByRole('textbox');
  const count = await fields.count();
  for (let i = 0; i < count; i += 1) await fields.nth(i).fill(`${value}${i + 1}`);
  await button(page, '整組送出').click();
}

export async function toSubmitted(page: Page) {
  await toAnswer(page);
  await submit(page);
  await expectOn(page, 'S-Submitted');
}

export async function toStudentQuestionDone(page: Page) {
  await toAnswer(page);
  await advance(page);
  await expectOn(page, 'S-QuestionDone');
}

/** S-Wait, then advances through every phase to FINISHED (M7). */
export async function toStudentResults(page: Page) {
  await toWait(page);
  await advance(page, 2 * STUDENT_QUESTIONS);
  await expectOn(page, 'S-Results');
}

/** Advances from S-Wait to S-Answer on the last question. */
export async function toLastAnswer(page: Page) {
  await toWait(page);
  await advance(page, 2 * STUDENT_QUESTIONS - 1);
  await expect(page.getByText(`第 ${STUDENT_QUESTIONS} 題 / 共 ${STUDENT_QUESTIONS} 題`)).toBeVisible();
  await expectOn(page, 'S-Answer');
}
