import { expect, test, type Page } from '@playwright/test';
import { pickerWill } from './googlePicker';
import { signInAsPageTeacher } from './googleSignIn';

async function expectMockBadge(page: Page) {
  await expect(page.getByText('模擬模式', { exact: true })).toBeVisible();
}

/** Main → T-Login → mock teacher account → T-Pick. */
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /我是老師/ }).click();
  await signInAsPageTeacher(page);
  await expect(page.getByRole('button', { name: '從 Google 雲端硬碟挑選' })).toBeVisible();
}

/** Clicks a pick button and chooses a sheet in the stubbed Google Picker (googlePicker.ts). */
async function pick(page: Page, button: string, sheet: string) {
  await pickerWill(page, sheet);
  await page.getByRole('button', { name: button }).click();
}

function statValue(page: Page, label: string) {
  return page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
}

async function expectImportCounts(page: Page, questions: string, groups: string, blanks: string) {
  await expect(page.getByRole('button', { name: '確認匯入，下一步' })).toBeVisible();
  await expect(statValue(page, '題數')).toHaveText(questions);
  await expect(statValue(page, '題組數')).toHaveText(groups);
  await expect(statValue(page, '填空格數')).toHaveText(blanks);
}

const groupField = (page: Page) => page.getByRole('group', { name: '組數' });
const onLobby = (page: Page) => expect(page.getByRole('button', { name: '修改設定' })).toBeVisible();

/** T-Pick → 題組＋單題範本 → T-Import → T-Setup (create). */
async function toSetup(page: Page) {
  await signIn(page);
  await pick(page, '從 Google 雲端硬碟挑選', '題組＋單題範本');
  await page.getByRole('button', { name: '確認匯入，下一步' }).click();
  await expect(page.getByRole('button', { name: '建立活動' })).toBeVisible();
}

test.describe('US2 preparation (quickstart Q3, Q4, Q14)', () => {
  test('Q3: the three mock spreadsheets, re-read, and closing the chooser', async ({ page }) => {
    await signIn(page);

    // Closing the chooser stays on T-Pick (US2 AC-5).
    await pickerWill(page, null);
    await page.getByRole('button', { name: '從 Google 雲端硬碟挑選' }).click();
    await expect(page.getByRole('button', { name: '從 Google 雲端硬碟挑選' })).toBeVisible();

    // 題組＋單題範本: 4 questions, 2 groups, 6 blanks, editable (US2 AC-1).
    await pick(page, '從 Google 雲端硬碟挑選', '題組＋單題範本');
    await expectImportCounts(page, '4', '2', '6');
    await expect(page.getByText('可編輯')).toBeVisible();
    await expect(page.getByRole('row', { name: /第 1 題/ })).toContainText('題組・2 小題');
    await expect(page.getByRole('row', { name: /第 1 題/ })).toContainText('G5、G6');
    await expect(page.getByRole('row', { name: /第 3 題/ })).toContainText('單題');
    await expectMockBadge(page);

    // Closing the chooser from "重新挑選" stays on T-Import.
    await page.getByRole('button', { name: '重新挑選' }).click();
    await page.keyboard.press('Escape');
    await expectImportCounts(page, '4', '2', '6');

    // 單題範本: 6 single questions, 6 blanks, read-only (US2 AC-2).
    await pick(page, '重新挑選', '單題範本');
    await expectImportCounts(page, '6', '0', '6');
    await expect(page.getByText('僅檢視')).toBeVisible();

    // 表頭錯誤範例: T-ImportError (US2 AC-3).
    await pick(page, '重新挑選', '表頭錯誤範例');
    await expect(page.getByRole('button', { name: '重新讀取' })).toBeVisible();
    await expect(page.getByText(/找不到同時寫著題號欄與作答欄表頭的那一列/)).toBeVisible();
    await expect(page.getByText('No.', { exact: true })).toBeVisible();
    await expect(page.getByText('學生填寫', { exact: true })).toBeVisible();
    await expect(page.getByText('作答欄：作答、答案、回答')).toBeVisible();
    await expect(page.getByText('題號欄與作答欄的表頭要在同一列。')).toBeVisible();
    await expectMockBadge(page);

    // Re-read succeeds as if the header was fixed (US2 AC-4).
    await page.getByRole('button', { name: '重新讀取' }).click();
    await expectImportCounts(page, '4', '2', '6');
  });

  test('Q4: group count, validation failure, create, edit settings, and cancel the activity', async ({
    page,
  }) => {
    await toSetup(page);
    await expect(page.getByRole('button', { name: '上一步' })).toBeVisible();
    await expect(page.getByText(/活動名稱/)).toHaveCount(0);

    // "+" and "−" change the count and the group list (US2 AC-7).
    const items = groupField(page).getByRole('listitem');
    const initial = await items.count();
    await groupField(page).getByRole('button', { name: '+' }).click();
    await expect(items).toHaveCount(initial + 1);
    await groupField(page).getByRole('button', { name: '−' }).click();
    await expect(items).toHaveCount(initial);

    // Validation failure stays and shows the message beside the field (US2 AC-9).
    await page.getByRole('button', { name: '模擬：驗證失敗' }).click();
    await page.getByRole('button', { name: '建立活動' }).click();
    await expect(groupField(page).getByText('模擬：驗證失敗')).toBeVisible();
    await expect(page.getByRole('button', { name: '建立活動' })).toBeVisible();

    // The second attempt creates the activity (US2 AC-8).
    await page.getByRole('button', { name: '建立活動' }).click();
    await onLobby(page);
    const groups = page.getByRole('list', { name: '組別' });
    await expect(groups.getByRole('listitem')).toHaveCount(initial);
    await expect(groups.getByText('還沒有人').first()).toBeVisible();
    await expect(page.getByRole('list', { name: '這一輪的題目' }).getByRole('listitem')).toHaveCount(4);
    await expectMockBadge(page);

    // Edit mode: "取消" returns to T-Lobby (US2 AC-10).
    await page.getByRole('button', { name: '修改設定' }).click();
    await expect(page.getByRole('button', { name: '儲存設定' })).toBeVisible();
    await expect(page.getByRole('button', { name: '建立活動' })).toHaveCount(0);
    await page.getByRole('button', { name: '取消' }).click();
    await onLobby(page);

    // Edit mode: validation failure, then a successful save returns to T-Lobby.
    await page.getByRole('button', { name: '修改設定' }).click();
    await groupField(page).getByRole('button', { name: '+' }).click();
    await page.getByRole('button', { name: '模擬：驗證失敗' }).click();
    await page.getByRole('button', { name: '儲存設定' }).click();
    await expect(groupField(page).getByText('模擬：驗證失敗')).toBeVisible();
    await page.getByRole('button', { name: '儲存設定' }).click();
    await onLobby(page);
    await expect(groups.getByRole('listitem')).toHaveCount(initial + 1);

    // "取消活動" → "繼續準備" closes the dialog and stays on T-Lobby (US2 AC-11).
    const cancelDialog = page.getByRole('dialog', { name: /取消活動/ });
    await page.getByRole('button', { name: '取消活動' }).click();
    await expect(cancelDialog).toBeVisible();
    await expect(cancelDialog).toContainText('選組頁');
    await cancelDialog.getByRole('button', { name: '繼續準備' }).click();
    await expect(cancelDialog).toBeHidden();
    await onLobby(page);
    await expect(groups.getByRole('listitem')).toHaveCount(initial + 1);

    // "確定取消活動" goes to T-Pick, where a new activity can be picked and created (US2 AC-12).
    await page.getByRole('button', { name: '取消活動' }).click();
    await cancelDialog.getByRole('button', { name: '確定取消活動' }).click();
    await expect(page.getByRole('button', { name: '從 Google 雲端硬碟挑選' })).toBeVisible();
    await pick(page, '從 Google 雲端硬碟挑選', '單題範本');
    await page.getByRole('button', { name: '確認匯入，下一步' }).click();
    await page.getByRole('button', { name: '建立活動' }).click();
    await onLobby(page);
    await expect(page.getByRole('list', { name: '這一輪的題目' }).getByRole('listitem')).toHaveCount(6);
  });

  test('Q14: browser back on T-Pick, T-Import, T-Setup and T-Lobby', async ({ page }) => {
    const pickButton = page.getByRole('button', { name: '從 Google 雲端硬碟挑選' });

    // T-Pick back = "取消" → Main.
    await signIn(page);
    await page.goBack();
    await expect(page.getByRole('button', { name: /我是老師/ })).toBeVisible();

    // T-Import back = "取消" → T-Pick.
    await signIn(page);
    await pick(page, '從 Google 雲端硬碟挑選', '題組＋單題範本');
    await expect(page.getByRole('button', { name: '確認匯入，下一步' })).toBeVisible();
    await page.goBack();
    await expect(pickButton).toBeVisible();

    // T-Setup (create) back = "上一步" → T-Import.
    await pick(page, '從 Google 雲端硬碟挑選', '題組＋單題範本');
    await page.getByRole('button', { name: '確認匯入，下一步' }).click();
    await expect(page.getByRole('button', { name: '建立活動' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: '確認匯入，下一步' })).toBeVisible();

    // T-Lobby has no back-type button: back stays.
    await page.getByRole('button', { name: '確認匯入，下一步' }).click();
    await page.getByRole('button', { name: '建立活動' }).click();
    await onLobby(page);
    await page.goBack();
    await onLobby(page);

    // The T-Lobby cancel dialog: back only closes it, like "繼續準備" (FR-014, FR-026).
    await page.getByRole('button', { name: '取消活動' }).click();
    await expect(page.getByRole('dialog', { name: /取消活動/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await onLobby(page);

    // T-Setup (edit) back = "取消" → T-Lobby.
    await page.getByRole('button', { name: '修改設定' }).click();
    await expect(page.getByRole('button', { name: '儲存設定' })).toBeVisible();
    await page.goBack();
    await onLobby(page);
  });
});
