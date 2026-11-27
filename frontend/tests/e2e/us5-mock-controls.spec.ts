import { expect, test, type Page } from '@playwright/test';
import {
  GROUP,
  expectOn,
  mockBar,
  submit,
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
import { connectTestServer, judgeGroup } from './testServer';

// 004 (T061): every page talks to this worker's test server, reset before each test.
test.beforeEach(async ({ page }) => {
  await connectTestServer(page);
});

// T094: the mock control bar shows only the FR-061 controls on each page (US5 AC-4–AC-8).

const ACCEPT = '模擬：接受';
const REJECT = '模擬：不接受';
const UNEXPECTED = '模擬：非預期錯誤';

/**
 * FR-061: the exact set of controls each page (and S-Submitted state) shows. 004 removed the activity
 * mock, so "模擬：推進到下一個階段" and T-Setup's "模擬：驗證失敗" are gone (004 plan, T042). 005 bound
 * the real submission service, so the judgement, groupmate and S-Answer validation controls are gone
 * too (005 T024, T041).
 */
const EXPECTED: [PageId, (page: Page) => Promise<void>, string[]][] = [
  ['Main', async (page) => {
    await page.goto('/');
    await expectOn(page, 'Main');
  }, []],
  ['T-Login', toLogin, [UNEXPECTED]],
  ['T-Pick', toPick, [UNEXPECTED]],
  ['T-Import', (page) => toImport(page), [UNEXPECTED]],
  ['T-ImportError', toImportError, [UNEXPECTED]],
  ['T-Setup', (page) => toSetup(page), [UNEXPECTED]],
  ['T-Lobby', (page) => toLobby(page), [UNEXPECTED]],
  ['T-Live', (page) => toLive(page), [UNEXPECTED]],
  ['T-QuestionEnd', toQuestionEnd, [UNEXPECTED]],
  ['T-Results', (page) => toResults(page), [UNEXPECTED]],
  ['S-JoinEmpty', (page) => toJoin(page), [UNEXPECTED]],
  ['S-Join', (page) => toJoin(page, 1), [UNEXPECTED]],
  ['S-Wait', toWait, [UNEXPECTED]],
  ['S-Answer', toAnswer, [UNEXPECTED]],
  ['S-Submitted', toSubmitted, []],
  // 005 T041: S-Rejected needs judging, which Phase 4 adds; restored in T043.
  ['S-QuestionDone', toStudentQuestionDone, []],
  ['S-Results', toStudentResults, []],
];

async function expectControls(page: Page, expected: string[]) {
  if (expected.length === 0) {
    await expect(mockBar(page)).toHaveCount(0);
    return;
  }
  const buttons = mockBar(page).getByRole('button');
  await expect(buttons).toHaveCount(expected.length);
  const labels = (await buttons.allTextContents()).sort();
  expect(labels).toEqual([...expected].sort());
}

test.describe('US5 mock controls per page (FR-061, US5 AC-6, AC-7)', () => {
  for (const [id, reach, expected] of EXPECTED) {
    test(`${id}: shows exactly [${expected.join('、')}]`, async ({ page }) => {
      await reach(page);
      await expectOn(page, id);
      await expectControls(page, expected);
    });
  }
});

test.describe('US5 mock control behaviour', () => {
  test('AC-5: 模擬：接受 goes to S-QuestionDone (not the last question)', async ({ page }) => {
    await toSubmitted(page);
    // 005 T043: the teacher accepts through the test server instead of "模擬：接受".
    await judgeGroup(GROUP, 'ACCEPTED');
    await expectOn(page, 'S-QuestionDone');
  });

  test('AC-5: 模擬：接受 on the last question goes to S-Results', async ({ page }) => {
    await toLastAnswer(page);
    await submit(page);
    // 005 T043: the teacher accepts through the test server instead of "模擬：接受".
    await judgeGroup(GROUP, 'ACCEPTED');
    await expectOn(page, 'S-Results');
  });

  test('AC-5: 模擬：不接受 stays on S-Submitted in the not-accepted state', async ({ page }) => {
    await toSubmitted(page);
    // 005 T043: the teacher rejects through the test server instead of "模擬：不接受".
    await judgeGroup(GROUP, 'REJECTED');
    await expectOn(page, 'S-Rejected');
    await expect(page.getByRole('button', { name: ACCEPT })).toHaveCount(0);
    await expect(page.getByRole('button', { name: REJECT })).toHaveCount(0);
  });
});
