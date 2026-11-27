import { expect, test, type Page } from '@playwright/test';
import { pickerWill } from './googlePicker';
import { fakeTeacherApi, googleWill } from './googleSignIn';
import {
  SHEET_SINGLE,
  advance,
  endQuestion,
  expectOn,
  pick,
  submit,
  toImport,
  toImportError,
  toJoin,
  toLastAnswer,
  toLobby,
  toLogin,
  toPick,
  toSetup,
  toWait,
  type PageId,
} from './us5-walk';
import { connectTestServer } from './testServer';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// T096: none of the elements removed in spec "相對於設計稿的調整" appears on any page or dialog
// (SC-004).

const REMOVED: (string | RegExp)[] = [
  '公平模式',
  '匯出 CSV',
  '限時',
  '剩餘時間',
  '時間到',
  '清掉舊答案',
  '備份',
  '開新一輪',
  '連結 Google 帳號',
  '解除連結',
  '複製網址',
  '連線分頁',
  '離線',
  '活動名稱',
  // Activity end time and total duration, e.g. "14:04:30 結束 · 共 4:30".
  '結束 ·',
  /\d{1,2}:\d{2}(:\d{2})? 結束/,
  /共 \d+:\d{2}/,
];

const visited = new Set<string>();

async function expectNoRemoved(page: Page, where: string) {
  const text = await page.locator('body').innerText();
  for (const item of REMOVED) {
    const found = typeof item === 'string' ? text.includes(item) : item.test(text);
    expect(found, `${where} shows removed element ${String(item)}`).toBe(false);
  }
  visited.add(where);
}

async function check(page: Page, id: PageId, label: string = id) {
  await expectOn(page, id);
  await expectNoRemoved(page, label);
}

test.describe('US5 removed elements (SC-004)', () => {
  test('Main, T-Login, T-Pick, T-Import, T-ImportError', async ({ page }) => {
    await page.goto('/');
    await check(page, 'Main', 'Main（沒有活動）');
    await advance(page);
    await check(page, 'Main', 'Main（有活動）');
    await toLogin(page);
    await check(page, 'T-Login');
    await fakeTeacherApi(page);
    await googleWill(page, { error: 'popup_closed' });
    await page.getByRole('button', { name: '用 Google 登入' }).click();
    await check(page, 'T-Login', 'T-Login（登入失敗）');
    await toPick(page);
    await check(page, 'T-Pick');
    await pickerWill(page, null);
    await page.getByRole('button', { name: '從 Google 雲端硬碟挑選' }).click();
    await toImport(page);
    await check(page, 'T-Import', 'T-Import（可編輯）');
    await pick(page, '重新挑選', SHEET_SINGLE);
    await check(page, 'T-Import', 'T-Import（僅檢視）');
    await toImportError(page);
    await check(page, 'T-ImportError');
  });

  test('T-Setup, T-Lobby, T-CancelConfirm', async ({ page }) => {
    await toSetup(page);
    await check(page, 'T-Setup', 'T-Setup（建立模式）');
    await toLobby(page);
    await check(page, 'T-Lobby');
    await page.getByRole('button', { name: '修改設定' }).click();
    await check(page, 'T-Setup', 'T-Setup（修改模式）');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '取消活動' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoRemoved(page, 'T-CancelConfirm');
  });

  for (const sheet of ['題組＋單題範本', SHEET_SINGLE]) {
    test(`T-Live, T-EndConfirm, T-QuestionEnd, T-Results, T-WriteBack (${sheet})`, async ({ page }) => {
      await toLobby(page, sheet);
      await page.getByRole('button', { name: '開放第 1 題' }).click();
      const questions = sheet === SHEET_SINGLE ? 6 : 4;
      for (let n = 1; n <= questions; n += 1) {
        if (n > 1) await page.getByRole('button', { name: `開放第 ${n} 題` }).click();
        await check(page, 'T-Live', `T-Live 第 ${n} 題`);
        await page.getByRole('button', { name: '結束這一題' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoRemoved(page, `T-EndConfirm 第 ${n} 題`);
        await page.getByRole('dialog').getByRole('button', { name: '繼續作答' }).click();
        await endQuestion(page);
        if (n < questions) await check(page, 'T-QuestionEnd', `T-QuestionEnd 第 ${n} 題`);
      }
      await check(page, 'T-Results', 'T-Results（尚未寫回）');
      await page.getByRole('button', { name: '寫回 Google Sheets' }).click();
      const dialog = page.getByRole('dialog', { name: /寫回 Google Sheets/ });
      await expectNoRemoved(page, 'T-WriteBack（確認前）');
      await dialog.getByRole('button', { name: '寫回', exact: true }).click();
      await expect(dialog.getByRole('button')).toHaveText(['關閉']);
      await expectNoRemoved(page, 'T-WriteBack（寫回結果）');
      await dialog.getByRole('button', { name: '關閉' }).click();
      await check(page, 'T-Results', 'T-Results（寫回後）');
    });
  }

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('student pages', async ({ page }) => {
    await toJoin(page);
    await check(page, 'S-JoinEmpty');
    await advance(page);
    await check(page, 'S-Join');
    await toWait(page);
    await check(page, 'S-Wait');
    await advance(page);
    await check(page, 'S-Answer');
    await submit(page);
    await check(page, 'S-Submitted');
    await page.getByRole('button', { name: '模擬：不接受' }).click();
    await check(page, 'S-Rejected');
    await advance(page);
    await check(page, 'S-QuestionDone');
    await toLastAnswer(page);
    await submit(page);
    await page.getByRole('button', { name: '模擬：接受' }).click();
    // 004 (RA-14): accepting on a student tab no longer moves the server; the teacher ends the question.
    await advance(page);
    await check(page, 'S-Results');
  });
});
