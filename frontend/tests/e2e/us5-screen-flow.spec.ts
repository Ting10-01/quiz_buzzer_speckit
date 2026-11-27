import { expect, test, type Page } from '@playwright/test';
import { fakeTeacherApi, googleWill } from './googleSignIn';
import {
  GROUP,
  SHEET_BAD,
  SHEET_OK,
  advance,
  endQuestion,
  expectOn,
  join,
  pick,
  submit,
  submitWithBlank,
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
import { connectTestServer, groupmateSubmits } from './testServer';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// T093: every arrow of diagrams/001-screen-flow.puml, one test per arrow (SC-001, SC-002).
// Test names start with the arrow's code, or with "from → to" for the arrows labelled on the
// diagram. S10 and S11 are not triggered by the 001 mock (SC-002 exclusions); S10 is covered by
// the StudentPlayPage component test (T079). Every arrival checks the "模擬模式" label (SC-003).

const groupField = (page: Page) => page.getByRole('group', { name: '組數' });
const groupItems = (page: Page) => groupField(page).getByRole('listitem');
const answerRows = (page: Page) =>
  page.getByRole('table', { name: '答案列表' }).getByRole('row').filter({ has: page.getByRole('button') });
const writeBackDialog = (page: Page) => page.getByRole('dialog', { name: /寫回 Google Sheets/ });

/** Accepts the earliest pending submission on T-Live (only that row is judgeable, FR-032). */
async function acceptEarliest(page: Page) {
  await answerRows(page).getByRole('button', { name: '接受', exact: true }).and(page.locator(':enabled')).first().click();
}

/** On T-Live of 題組＋單題範本: opens and ends questions until question `n` is live. */
async function liveOn(page: Page, n: number) {
  await toLive(page);
  for (let q = 2; q <= n; q += 1) {
    await endQuestion(page);
    await page.getByRole('button', { name: `開放第 ${q} 題` }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`第 ${n} 題`);
  await expectOn(page, 'T-Live');
}

test.describe('US5 screen flow: labelled arrows (teacher round)', () => {
  test('Main → T-Login: 點擊：我是老師', async ({ page }) => {
    await page.goto('/');
    await expectOn(page, 'Main');
    await page.getByRole('button', { name: /我是老師/ }).click();
    await expectOn(page, 'T-Login');
  });

  test('T-Login → T-Pick: 用 Google 登入（成功）', async ({ page }) => {
    await toPick(page);
  });

  test('T-Pick → T-Import: 從雲端硬碟挑選（辨識成功）', async ({ page }) => {
    await toPick(page);
    await pick(page, '從 Google 雲端硬碟挑選', SHEET_OK);
    await expectOn(page, 'T-Import');
  });

  test('T-Import → T-Setup: 確認匯入，下一步', async ({ page }) => {
    await toImport(page);
    await page.getByRole('button', { name: '確認匯入，下一步' }).click();
    await expectOn(page, 'T-Setup');
    await expect(page.getByRole('button', { name: '建立活動' })).toBeVisible();
  });

  test('T-Setup → T-Lobby: 建立活動（驗證通過）', async ({ page }) => {
    await toSetup(page);
    await page.getByRole('button', { name: '建立活動' }).click();
    await expectOn(page, 'T-Lobby');
  });

  test('T-Lobby → T-Live: 開放第 1 題', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '開放第 1 題' }).click();
    await expectOn(page, 'T-Live');
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('T-Live → T-QuestionEnd: 接受（非最後一題）', async ({ page }) => {
    await toLive(page);
    await acceptEarliest(page);
    await expectOn(page, 'T-QuestionEnd');
  });

  test('T-Live → T-QuestionEnd: 結束這一題，確認後（非最後一題）', async ({ page }) => {
    await toLive(page);
    await endQuestion(page);
    await expectOn(page, 'T-QuestionEnd');
  });

  test('T-QuestionEnd → T-Live: 開放第 n+1 題', async ({ page }) => {
    await toQuestionEnd(page);
    await page.getByRole('button', { name: '開放第 2 題' }).click();
    await expectOn(page, 'T-Live');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('第 2 題');
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('T-Live → T-Results: 接受（最後一題）', async ({ page }) => {
    await liveOn(page, 4);
    await acceptEarliest(page);
    await expectOn(page, 'T-Results');
  });

  test('T-Live → T-Results: 結束這一題，確認後（最後一題）', async ({ page }) => {
    await liveOn(page, 4);
    await endQuestion(page);
    await expectOn(page, 'T-Results');
  });

  test('T-Results → T-Results: 寫回 Google Sheets，按「寫回」後按「關閉」', async ({ page }) => {
    await toResults(page);
    await page.getByRole('button', { name: '寫回 Google Sheets' }).click();
    await writeBackDialog(page).getByRole('button', { name: '寫回', exact: true }).click();
    await expect(writeBackDialog(page)).toContainText('寫回成功');
    await writeBackDialog(page).getByRole('button', { name: '關閉' }).click();
    await expect(writeBackDialog(page)).toBeHidden();
    await expectOn(page, 'T-Results');
    await expect(page.getByRole('main')).toContainText('寫回成功');
  });
});

test.describe('US5 screen flow: labelled arrows (student round)', () => {
  test('Main → S-Join: 我是學生（有活動）', async ({ page }) => {
    await page.goto('/');
    await advance(page);
    await page.getByRole('button', { name: /我是學生/ }).click();
    await expectOn(page, 'S-Join');
  });

  test('S-Join → S-Wait: 加入第 n 組', async ({ page }) => {
    await toJoin(page, 1);
    await join(page);
    await expectOn(page, 'S-Wait');
  });

  test('S-Wait → S-Answer: 階段：老師開放第 1 題', async ({ page }) => {
    await toWait(page);
    await advance(page);
    await expectOn(page, 'S-Answer');
    await expect(page.getByText('第 1 題 / 共 4 題')).toBeVisible();
  });

  test('S-Answer → S-Submitted: 整組送出', async ({ page }) => {
    await toAnswer(page);
    await submit(page);
    await expectOn(page, 'S-Submitted');
  });

  test('S-Open (S-Answer) → S-QuestionDone: 階段：本題結束（非最後一題）', async ({ page }) => {
    await toAnswer(page);
    await advance(page);
    await expectOn(page, 'S-QuestionDone');
  });

  test('S-Open (S-Submitted 等待判定) → S-QuestionDone: 階段：本題結束（非最後一題）', async ({ page }) => {
    await toSubmitted(page);
    await advance(page);
    await expectOn(page, 'S-QuestionDone');
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('S-Open (S-Submitted 不接受) → S-QuestionDone: 階段：本題結束（非最後一題）', async ({ page }) => {
    await toSubmitted(page);
    await page.getByRole('button', { name: '模擬：不接受' }).click();
    await expectOn(page, 'S-Rejected');
    await advance(page);
    await expectOn(page, 'S-QuestionDone');
  });

  test('S-QuestionDone → S-Answer: 階段：老師開放下一題', async ({ page }) => {
    await toStudentQuestionDone(page);
    await advance(page);
    await expectOn(page, 'S-Answer');
    await expect(page.getByText('第 2 題 / 共 4 題')).toBeVisible();
  });

  test('S-Open (S-Answer) → S-Results: 階段：最後一題結束', async ({ page }) => {
    await toLastAnswer(page);
    await advance(page);
    await expectOn(page, 'S-Results');
  });

  test('S-Open (S-Submitted 等待判定) → S-Results: 階段：最後一題結束', async ({ page }) => {
    await toLastAnswer(page);
    await submit(page);
    await expectOn(page, 'S-Submitted');
    await advance(page);
    await expectOn(page, 'S-Results');
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('S-Submitted → S-QuestionDone: 判定：接受（本題結束）', async ({ page }) => {
    await toSubmitted(page);
    await page.getByRole('button', { name: '模擬：接受' }).click();
    // 004 (RA-14): accepting on a student tab no longer moves the server; the teacher ends the question.
    await advance(page);
    await expectOn(page, 'S-QuestionDone');
    await expect(page.getByRole('region', { name: '本題結果' })).toContainText(`第 ${GROUP} 組`);
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('S-Submitted → S-Submitted（不接受）: 判定：不接受', async ({ page }) => {
    await toSubmitted(page);
    await page.getByRole('button', { name: '模擬：不接受' }).click();
    await expectOn(page, 'S-Rejected');
  });
});

test.describe('US5 screen flow: coded arrows H1–H4', () => {
  test('H1: Main → S-Join（沒有活動）: 我是學生', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /我是學生/ }).click();
    await expectOn(page, 'S-JoinEmpty');
  });

  test('H2: Main → Main: 目前活動資訊更新', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('目前沒有活動', { exact: true })).toBeVisible();
    await advance(page);
    await expectOn(page, 'Main');
    await expect(page.getByText('準備中', { exact: true })).toBeVisible();
    await expect(page.getByText('4 題 · 6 組')).toBeVisible();
    await advance(page);
    await expect(page.getByText('搶答中', { exact: true })).toBeVisible();
  });

  test('H3: T-Login → Main: 返回首頁', async ({ page }) => {
    await toLogin(page);
    await page.getByRole('button', { name: '返回首頁' }).click();
    await expectOn(page, 'Main');
  });

  test('H4: S-Join → Main: 返回首頁', async ({ page }) => {
    await toJoin(page, 1);
    await expectOn(page, 'S-Join');
    await page.getByRole('button', { name: '返回首頁' }).click();
    await expectOn(page, 'Main');
  });

  test('H4: S-Join（沒有活動）→ Main: 返回首頁', async ({ page }) => {
    await toJoin(page);
    await page.getByRole('button', { name: '返回首頁' }).click();
    await expectOn(page, 'Main');
  });
});

test.describe('US5 screen flow: coded arrows T1–T17', () => {
  test('T1: T-Login → T-Login: 用 Google 登入（取消）', async ({ page }) => {
    await toLogin(page);
    await fakeTeacherApi(page);
    await googleWill(page, { error: 'popup_closed' });
    await page.getByRole('button', { name: '用 Google 登入' }).click();
    await expectOn(page, 'T-Login');
    await expect(page.getByText('已取消登入')).toBeVisible();
  });

  test('T2: T-Pick → T-ImportError: 從雲端硬碟挑選（找不到表頭）', async ({ page }) => {
    await toPick(page);
    await pick(page, '從 Google 雲端硬碟挑選', SHEET_BAD);
    await expectOn(page, 'T-ImportError');
  });

  test('T3: T-Pick → Main: 取消', async ({ page }) => {
    await toPick(page);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expectOn(page, 'Main');
  });

  test('T4: T-Import → T-Import: 切換工作表（辨識成功）', async ({ page }) => {
    await toImport(page);
    await page.getByRole('tab', { name: '備註' }).click();
    await expectOn(page, 'T-Import');
    await expect(page.getByRole('tab', { name: '備註' })).toHaveAttribute('aria-selected', 'true');
  });

  test('T4: T-Import → T-Import: 重新挑選（辨識成功）', async ({ page }) => {
    await toImport(page);
    await pick(page, '重新挑選', '單題範本');
    await expectOn(page, 'T-Import');
    await expect(page.getByText('僅檢視')).toBeVisible();
  });

  test('T5: T-Import → T-ImportError: 重新挑選（找不到表頭）', async ({ page }) => {
    await toImport(page);
    await pick(page, '重新挑選', SHEET_BAD);
    await expectOn(page, 'T-ImportError');
  });

  test('T6: T-Import → T-Pick: 取消', async ({ page }) => {
    await toImport(page);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expectOn(page, 'T-Pick');
  });

  test('T7: T-ImportError → T-Import: 重新讀取（辨識成功）', async ({ page }) => {
    await toImportError(page);
    await page.getByRole('button', { name: '重新讀取' }).click();
    await expectOn(page, 'T-Import');
  });

  test('T7: T-ImportError → T-Import: 重新挑選（辨識成功）', async ({ page }) => {
    await toImportError(page);
    await pick(page, '重新挑選', SHEET_OK);
    await expectOn(page, 'T-Import');
  });

  test('T8: T-ImportError → T-ImportError: 重新挑選（仍找不到表頭）', async ({ page }) => {
    await toImportError(page);
    await pick(page, '重新挑選', SHEET_BAD);
    await expectOn(page, 'T-ImportError');
  });

  test('T9: T-Setup → T-Import: 上一步（建立模式）', async ({ page }) => {
    await toSetup(page);
    await page.getByRole('button', { name: '上一步' }).click();
    await expectOn(page, 'T-Import');
  });

  test('T10: T-Setup → T-Setup: 「−」「+」', async ({ page }) => {
    await toSetup(page);
    const initial = await groupItems(page).count();
    await groupField(page).getByRole('button', { name: '+' }).click();
    await expectOn(page, 'T-Setup');
    await expect(groupItems(page)).toHaveCount(initial + 1);
    await groupField(page).getByRole('button', { name: '−' }).click();
    await expectOn(page, 'T-Setup');
    await expect(groupItems(page)).toHaveCount(initial);
  });

  test('T11: T-Setup → T-Lobby: 儲存設定（驗證通過）', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '修改設定' }).click();
    await page.getByRole('button', { name: '儲存設定' }).click();
    await expectOn(page, 'T-Lobby');
  });

  test('T11: T-Setup → T-Lobby: 取消（修改模式）', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '修改設定' }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expectOn(page, 'T-Lobby');
  });

  test('T12: T-Lobby → T-Setup: 修改設定', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '修改設定' }).click();
    await expectOn(page, 'T-Setup');
    await expect(page.getByRole('button', { name: '儲存設定' })).toBeVisible();
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('T13: T-Live → T-Live: 不接受（只能判定最早一筆）', async ({ page }) => {
    await toLive(page);
    const first = answerRows(page).first();
    await first.getByRole('button', { name: '不接受', exact: true }).click();
    await expectOn(page, 'T-Live');
    await expect(first.getByRole('button', { name: '不接受', exact: true })).toBeDisabled();
    await expect(answerRows(page).nth(1).getByRole('button', { name: '接受', exact: true })).toBeEnabled();
  });

  test('T14: T-Live → T-Live: 結束這一題，按「繼續作答」', async ({ page }) => {
    await toLive(page);
    await page.getByRole('button', { name: '結束這一題' }).click();
    const dialog = page.getByRole('dialog', { name: /結束第 1 題/ });
    await dialog.getByRole('button', { name: '繼續作答' }).click();
    await expect(dialog).toBeHidden();
    await expectOn(page, 'T-Live');
  });

  test('T15: T-Results → T-Results: 寫回 Google Sheets，按「取消」', async ({ page }) => {
    await toResults(page);
    await page.getByRole('button', { name: '寫回 Google Sheets' }).click();
    await writeBackDialog(page).getByRole('button', { name: '取消' }).click();
    await expect(writeBackDialog(page)).toBeHidden();
    await expectOn(page, 'T-Results');
    await expect(page.getByRole('main')).toContainText('尚未寫回');
  });

  test('T16: T-Lobby → T-Lobby: 取消活動，按「繼續準備」', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '取消活動' }).click();
    const dialog = page.getByRole('dialog', { name: /取消活動/ });
    await dialog.getByRole('button', { name: '繼續準備' }).click();
    await expect(dialog).toBeHidden();
    await expectOn(page, 'T-Lobby');
  });

  test('T17: T-Lobby → T-Pick: 取消活動，按「確定取消活動」', async ({ page }) => {
    await toLobby(page);
    await page.getByRole('button', { name: '取消活動' }).click();
    await page.getByRole('dialog', { name: /取消活動/ }).getByRole('button', { name: '確定取消活動' }).click();
    await expectOn(page, 'T-Pick');
  });
});

test.describe('US5 screen flow: coded arrows S1–S9', () => {
  test('S1: S-Join → S-Join: 選擇組別', async ({ page }) => {
    await toJoin(page, 1);
    const radio = page.getByRole('radio', { name: new RegExp(`第 ${GROUP} 組`) });
    await radio.click();
    await expectOn(page, 'S-Join');
    await expect(radio).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: `加入第 ${GROUP} 組` })).toBeEnabled();
  });

  test('S2: S-Wait → S-Join: 選錯組別？重新選擇', async ({ page }) => {
    await toWait(page);
    await page.getByRole('button', { name: '選錯組別？重新選擇' }).click();
    await expectOn(page, 'S-Join');
  });

  test('S3: S-Join（沒有活動）→ S-Join: 老師建立活動', async ({ page }) => {
    await toJoin(page);
    await advance(page);
    await expectOn(page, 'S-Join');
  });

  test('S4: S-Join → S-Answer: 加入時已在搶答中', async ({ page }) => {
    await toJoin(page, 2);
    await join(page);
    await expectOn(page, 'S-Answer');
  });

  test('S5: S-Answer → S-Answer: 整組送出（驗證失敗）', async ({ page }) => {
    await toAnswer(page);
    // 005 T041: a blank cell fails the server's validation instead of "模擬：驗證失敗".
    await submitWithBlank(page);
    await expectOn(page, 'S-Answer');
    await expect(page.getByRole('textbox').first()).toHaveAccessibleDescription('每一格都填才能送出');
  });

  // 005 T041: needs judging, which Phase 4 adds; skipped until T043.
  test.skip('S6: S-Submitted → S-Results: 判定：接受（最後一題）', async ({ page }) => {
    await toLastAnswer(page);
    await submit(page);
    await expectOn(page, 'S-Submitted');
    await page.getByRole('button', { name: '模擬：接受' }).click();
    // 004 (RA-14): accepting on a student tab no longer moves the server; the teacher ends the question.
    await advance(page);
    await expectOn(page, 'S-Results');
  });

  test('S7: S-Answer → S-Submitted: 同組組員送出', async ({ page }) => {
    await toAnswer(page);
    // 005 T041: another tab of the group submits through the test server.
    await groupmateSubmits(GROUP);
    await expectOn(page, 'S-Submitted');
  });

  test('S8: S-Join → S-QuestionDone: 加入時本題已結束', async ({ page }) => {
    await toJoin(page, 3);
    await join(page);
    await expectOn(page, 'S-QuestionDone');
    await expect(page.getByRole('region', { name: '本組的答案' })).toContainText('本組沒有送出');
  });

  test('S9: S-Join → S-Results: 加入時活動已結束', async ({ page }) => {
    await toJoin(page, 9);
    await join(page);
    await expectOn(page, 'S-Results');
    await expect(page.getByText('0 題', { exact: true })).toBeVisible();
  });
});

// FR-014: pages without a back-type button stay on browser back; reload always returns to Main.
const STAY_ON_BACK: [PageId, (page: Page) => Promise<void>][] = [
  ['T-ImportError', toImportError],
  ['T-Live', (page) => toLive(page)],
  ['T-QuestionEnd', toQuestionEnd],
  ['T-Results', (page) => toResults(page)],
  ['S-Answer', toAnswer],
  ['S-Submitted', toSubmitted],
  ['S-QuestionDone', toStudentQuestionDone],
  ['S-Results', toStudentResults],
];

test.describe('US5 screen flow: browser back and reload (FR-014)', () => {
  for (const [id, reach] of STAY_ON_BACK) {
    test(`${id}: browser back stays, reload returns to Main`, async ({ page }) => {
      await reach(page);
      await page.goBack();
      await expectOn(page, id);
      await page.reload();
      // 004: the activity stays on the server after a reload, so only the page is checked.
      await expectOn(page, 'Main');
    });
  }
});
