import { expect, test, type Page, type Route } from '@playwright/test';
import { signInAsPageTeacher } from './googleSignIn';
import {
  SHEET_OK,
  errorArea,
  expectOn,
  mockBar,
  pick,
  toAnswer,
  toImport,
  toImportError,
  toLive,
  toLobby,
  toLogin,
  toPick,
  toQuestionEnd,
  toResults,
  toSetup,
} from './us5-walk';
import { connectTestServer } from './testServer';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// T095: "模擬：非預期錯誤" on each of the 12 FR-061 pages (US5 AC-9–AC-11, quickstart Q12).
// The first service call fails: stay on the page, ErrorArea shows "模擬：連不上伺服器", and what
// was entered is unchanged. The second attempt succeeds and clears the message.

const MESSAGE = '模擬：連不上伺服器';
const HINT = '已設定：下一次介面呼叫會回傳非預期錯誤';

async function armUnexpectedError(page: Page) {
  await page.getByRole('button', { name: '模擬：非預期錯誤' }).click();
  await expect(mockBar(page).getByRole('status')).toHaveText(HINT);
}

async function expectError(page: Page) {
  await expect(errorArea(page)).toHaveText(MESSAGE);
}

async function expectNoError(page: Page) {
  await expect(errorArea(page)).toHaveCount(0);
}

/** Makes requests to `url` fail as if the server were down; returns a function that undoes it. */
async function serverDown(page: Page, url: string) {
  const handler = (route: Route) => route.abort();
  await page.route(url, handler);
  return () => page.unroute(url, handler);
}

async function expectServerDown(page: Page) {
  await expect(errorArea(page)).toHaveText('連不上伺服器，請確認伺服器已啟動');
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const groupItems = (page: Page) => page.getByRole('group', { name: '組數' }).getByRole('listitem');

test.describe('US5 unexpected error on every page with a service call (FR-009)', () => {
  // auth is real since 002, so the mock control cannot fail it; an unreachable server does instead.
  test('T-Login: 用 Google 登入', async ({ page }) => {
    await toLogin(page);
    const restore = await serverDown(page, '**/api/auth/config');
    await button(page, '用 Google 登入').click();
    await expectOn(page, 'T-Login');
    await expectServerDown(page);

    await restore();
    await signInAsPageTeacher(page);
    await expectOn(page, 'T-Pick');
    await expectNoError(page);
  });

  // guidedNotes is real since 003, so the mock control cannot fail it; an unreachable server does.
  test('T-Pick: 從 Google 雲端硬碟挑選', async ({ page }) => {
    await toPick(page);
    const restore = await serverDown(page, '**/api/auth/picker-token');
    await button(page, '從 Google 雲端硬碟挑選').click();
    await expectOn(page, 'T-Pick');
    await expectServerDown(page);

    await restore();
    await pick(page, '從 Google 雲端硬碟挑選', SHEET_OK);
    await expectOn(page, 'T-Import');
    await expectNoError(page);
  });

  test('T-Import: 切換工作表', async ({ page }) => {
    await toImport(page);
    const restore = await serverDown(page, '**/api/guided-notes/read');
    await page.getByRole('tab', { name: '備註' }).click();
    await expectOn(page, 'T-Import');
    await expectServerDown(page);
    await expect(page.getByRole('tab', { name: '學習單' })).toHaveAttribute('aria-selected', 'true');

    await restore();
    await page.getByRole('tab', { name: '備註' }).click();
    await expect(page.getByRole('tab', { name: '備註' })).toHaveAttribute('aria-selected', 'true');
    await expectOn(page, 'T-Import');
    await expectNoError(page);
  });

  test('T-ImportError: 重新讀取', async ({ page }) => {
    await toImportError(page);
    const restore = await serverDown(page, '**/api/guided-notes/read');
    await button(page, '重新讀取').click();
    await expectOn(page, 'T-ImportError');
    await expectServerDown(page);

    await restore();
    await button(page, '重新讀取').click();
    await expectOn(page, 'T-Import');
    await expectNoError(page);
  });

  test('T-Setup: 建立活動 keeps the group count', async ({ page }) => {
    await toSetup(page);
    const initial = await groupItems(page).count();
    await page.getByRole('group', { name: '組數' }).getByRole('button', { name: '+' }).click();
    await expect(groupItems(page)).toHaveCount(initial + 1);
    // 004: activity is real, so an unreachable server fails it instead of the mock control.
    const restore = await serverDown(page, '**/api/activity**');
    await button(page, '建立活動').click();
    await expectOn(page, 'T-Setup');
    await expectServerDown(page);
    await restore();
    await expect(groupItems(page)).toHaveCount(initial + 1);

    await button(page, '建立活動').click();
    await expectOn(page, 'T-Lobby');
    await expectNoError(page);
    await expect(page.getByRole('list', { name: '組別' }).getByRole('listitem')).toHaveCount(initial + 1);
  });

  test('T-Lobby: 開放第 1 題', async ({ page }) => {
    await toLobby(page);
    // 004: activity is real, so an unreachable server fails it instead of the mock control.
    const restore = await serverDown(page, '**/api/activity**');
    await button(page, '開放第 1 題').click();
    await expectOn(page, 'T-Lobby');
    await expectServerDown(page);
    await restore();

    await button(page, '開放第 1 題').click();
    await expectOn(page, 'T-Live');
    await expectNoError(page);
  });

  test('T-Live: 結束並公布結果 closes the dialog first', async ({ page }) => {
    await toLive(page);
    // 004: activity is real, so an unreachable server fails it instead of the mock control.
    const restore = await serverDown(page, '**/api/activity**');
    await button(page, '結束這一題').click();
    const dialog = page.getByRole('dialog', { name: /結束第 1 題/ });
    await dialog.getByRole('button', { name: '結束並公布結果' }).click();
    await expect(dialog).toBeHidden();
    await expectOn(page, 'T-Live');
    await expectServerDown(page);
    await restore();

    await button(page, '結束這一題').click();
    await dialog.getByRole('button', { name: '結束並公布結果' }).click();
    await expectOn(page, 'T-QuestionEnd');
    await expectNoError(page);
  });

  test('T-QuestionEnd: 開放第 2 題', async ({ page }) => {
    await toQuestionEnd(page);
    // 004: activity is real, so an unreachable server fails it instead of the mock control.
    const restore = await serverDown(page, '**/api/activity**');
    await button(page, '開放第 2 題').click();
    await expectOn(page, 'T-QuestionEnd');
    await expectServerDown(page);
    await restore();

    await button(page, '開放第 2 題').click();
    await expectOn(page, 'T-Live');
    await expectNoError(page);
  });

  test('T-Results: 寫回 closes the dialog first', async ({ page }) => {
    await toResults(page);
    await armUnexpectedError(page);
    const dialog = page.getByRole('dialog', { name: /寫回 Google Sheets/ });
    await button(page, '寫回 Google Sheets').click();
    await dialog.getByRole('button', { name: '寫回', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectOn(page, 'T-Results');
    await expectError(page);
    await expect(page.getByRole('main')).toContainText('尚未寫回');

    await button(page, '寫回 Google Sheets').click();
    await dialog.getByRole('button', { name: '寫回', exact: true }).click();
    await expect(dialog).toContainText('寫回成功');
    await dialog.getByRole('button', { name: '關閉' }).click();
    await expectOn(page, 'T-Results');
    await expectNoError(page);
  });



  test('S-Answer: 整組送出 keeps the typed answers', async ({ page }) => {
    await toAnswer(page);
    const fields = page.getByRole('textbox');
    const count = await fields.count();
    for (let i = 0; i < count; i += 1) await fields.nth(i).fill(`答${i + 1}`);
    await armUnexpectedError(page);
    await button(page, '整組送出').click();
    await expectOn(page, 'S-Answer');
    await expectError(page);
    for (let i = 0; i < count; i += 1) await expect(fields.nth(i)).toHaveValue(`答${i + 1}`);

    await button(page, '整組送出').click();
    await expectOn(page, 'S-Submitted');
    await expectNoError(page);
  });
});

test('AC-11: the armed hint disappears after changing pages', async ({ page }) => {
  await toLogin(page);
  await armUnexpectedError(page);
  await button(page, '返回首頁').click();
  await expectOn(page, 'Main');
  await expect(page.getByText(HINT)).toHaveCount(0);
});
