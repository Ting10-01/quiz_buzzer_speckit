// T070: T-Results and T-WriteBack (US3 AC-10–13, FR-040–FR-042, FR-003, FR-014, SC-004).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity, QuestionResult, WriteBackResult } from '@quiz-buzzer/shared/entities';
import { TeacherResultsPage } from '../../src/pages/teacher/TeacherResultsPage';
import {
  createFakeRegistry,
  renderWithRegistry,
  type FakeRegistryOverrides,
} from '../helpers/createFakeRegistry';
import {
  makeActivity,
  makeMixedQuestions,
  makeQuestionResult,
  makeSubmission,
} from '../helpers/fixtures';
import { actionBarSides, goBack, setupRouter, walkToLive } from '../helpers/pageQueries';

/** Four mixed questions (6 blank cells), three groups, finished. */
function finishedActivity(): Activity {
  return makeActivity({ questions: makeMixedQuestions(), phase: 'FINISHED', currentQuestion: 4 });
}

/**
 * Question 1: group 2 won out of three submissions. behindFirstMs is deliberately NOT elapsedMs
 * minus the first elapsedMs, so the page must show behindFirstMs as given (FR-003).
 * Question 2: submitted but nobody accepted. Question 3: nobody submitted. Question 4: group 1 won.
 */
function results(): QuestionResult[] {
  const q1Winner = makeSubmission({
    questionNumber: 1,
    groupNumber: 2,
    answers: ['CPU', '作業系統'],
    rank: 1,
    elapsedMs: 1000,
    judgement: 'ACCEPTED',
  });
  const q1 = [
    q1Winner,
    makeSubmission({ questionNumber: 1, groupNumber: 3, answers: ['GPU', '作業系統'], rank: 2, elapsedMs: 3000, judgement: 'UNJUDGED' }),
    makeSubmission({ questionNumber: 1, groupNumber: 1, answers: ['CPU', '驅動程式'], rank: 3, elapsedMs: 5000, judgement: 'UNJUDGED' }),
  ];
  const q2 = [
    makeSubmission({ questionNumber: 2, groupNumber: 1, answers: ['演算法', '佇列'], rank: 1, elapsedMs: 2000, judgement: 'REJECTED' }),
  ];
  const q4Winner = makeSubmission({ questionNumber: 4, groupNumber: 1, answers: ['IP'], rank: 1, elapsedMs: 4000, judgement: 'ACCEPTED' });
  return [
    makeQuestionResult({ questionNumber: 1, winner: q1Winner, submissions: q1, behindFirstMs: [0, 9999, 12345] }),
    makeQuestionResult({ questionNumber: 2, submissions: q2 }),
    makeQuestionResult({ questionNumber: 3 }),
    makeQuestionResult({ questionNumber: 4, winner: q4Winner, submissions: [q4Winner] }),
  ];
}

function setup(overrides: FakeRegistryOverrides = {}, activity: Activity = finishedActivity()) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({
    ...overrides,
    result: {
      getAllResults: vi.fn().mockResolvedValue(results()),
      writeBack: vi.fn(),
      ...overrides.result,
    },
  });
  const view = renderWithRegistry(
    <TeacherResultsPage navigate={navigate} page={{ id: 'T-Results', activity }} />,
    registry,
  );
  return { navigate, registry, view };
}

const question = (n: number) => screen.findByRole('region', { name: `第 ${n} 題` });

/** The row of a question's region whose text contains `group`. */
function submissionRow(region: HTMLElement, group: string): HTMLElement {
  const row = within(region)
    .getAllByRole('row')
    .find((r) => r.textContent?.includes(group));
  if (!row) throw new Error(`no row for ${group}`);
  return row;
}

const writeBackDialog = () => screen.queryByRole('dialog', { name: /寫回 Google Sheets/ });

async function openWriteBack() {
  await userEvent.click(await screen.findByRole('button', { name: '寫回 Google Sheets' }));
  const dialog = writeBackDialog();
  if (!dialog) throw new Error('write-back dialog did not open');
  return dialog;
}

describe('TeacherResultsPage display (FR-040)', () => {
  it('loads getAllResults once', async () => {
    const { registry } = setup();
    await question(1);
    expect(registry.result.getAllResults).toHaveBeenCalledTimes(1);
  });

  it('shows each question\'s winning group and answers, and its submitted count', async () => {
    setup();
    const q1 = await question(1);
    expect(q1).toHaveTextContent('第 2 組');
    expect(q1).toHaveTextContent('CPU');
    expect(q1).toHaveTextContent('送出 3 組');
    const q4 = await question(4);
    expect(q4).toHaveTextContent('第 1 組');
    expect(q4).toHaveTextContent('IP');
    expect(q4).toHaveTextContent('送出 1 組');
  });

  it('shows "沒有組別搶答成功" and "沒有組別送出" for questions without a winner (edge)', async () => {
    setup();
    expect(await question(2)).toHaveTextContent('沒有組別搶答成功');
    expect(await question(3)).toHaveTextContent('沒有組別送出');
    expect(await question(3)).toHaveTextContent('送出 0 組');
  });

  it('lists every submission of a question with rank, group, answers and judgement', async () => {
    setup();
    const q1 = await question(1);
    const winnerRow = submissionRow(q1, '第 2 組');
    expect(winnerRow).toHaveTextContent('#1');
    expect(winnerRow).toHaveTextContent('已接受');
    const third = submissionRow(q1, '第 1 組');
    expect(third).toHaveTextContent('#3');
    expect(third).toHaveTextContent('驅動程式');
    expect(third).toHaveTextContent('未判定');
    expect(submissionRow(await question(2), '第 1 組')).toHaveTextContent('不接受');
  });

  it('shows the seconds behind first from behindFirstMs, not computed from elapsedMs (FR-003)', async () => {
    setup();
    const q1 = await question(1);
    expect(submissionRow(q1, '第 3 組')).toHaveTextContent('慢 9.999 秒');
    expect(submissionRow(q1, '第 1 組')).toHaveTextContent('慢 12.345 秒');
    // elapsedMs differences would be 2.000 and 4.000 seconds.
    expect(q1).not.toHaveTextContent('慢 2.000 秒');
    expect(q1).not.toHaveTextContent('慢 4.000 秒');
  });

  it('shows the questions won by each group', async () => {
    setup();
    await question(1);
    const list = screen.getByRole('list', { name: '各組搶到的題數' });
    const item = (group: string) =>
      within(list)
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes(group));
    expect(item('第 1 組')).toHaveTextContent('1 題');
    expect(item('第 2 組')).toHaveTextContent('1 題');
    expect(item('第 3 組')).toHaveTextContent('0 題');
  });

  it('previews the write-back: the winning answers in their blank cells', async () => {
    setup();
    await question(1);
    const preview = screen.getByRole('region', { name: '學習單預覽' });
    expect(preview).toHaveTextContent('G5');
    expect(preview).toHaveTextContent('CPU');
    expect(preview).toHaveTextContent('作業系統');
    expect(preview).toHaveTextContent('G13');
    expect(preview).toHaveTextContent('IP');
  });

  it('shows "尚未寫回" before writing back', async () => {
    setup();
    await question(1);
    expect(screen.getByRole('main')).toHaveTextContent('尚未寫回');
  });

  it('shows none of the removed design elements (SC-004)', async () => {
    setup();
    await question(1);
    expect(screen.queryByText(/匯出 CSV|CSV|備份|開新一輪|清掉舊答案|結束 ·|共 \d+:\d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /匯出|開新一輪|備份/ })).not.toBeInTheDocument();
  });

  it('puts only "寫回 Google Sheets" in the action bar, on the right (RD-09)', async () => {
    const { view } = setup();
    await question(1);
    expect(actionBarSides(view.container)).toEqual({ left: [], right: ['寫回 Google Sheets'] });
  });
});

describe('TeacherResultsPage T-WriteBack (FR-041, US3 AC-10, AC-13)', () => {
  it('"寫回 Google Sheets" opens the dialog with sheet, worksheet, cell and question counts and the scope', async () => {
    const { registry } = setup();
    const dialog = await openWriteBack();
    expect(dialog).toHaveTextContent('Sample Sheet Title');
    expect(dialog).toHaveTextContent('學習單');
    expect(dialog).toHaveTextContent('6 格');
    expect(dialog).toHaveTextContent('4 題');
    expect(dialog).toHaveTextContent('覆蓋');
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '寫回' })).toBeInTheDocument();
    expect(registry.result.writeBack).not.toHaveBeenCalled();
  });

  it('does not offer a backup or clearing old answers (SC-004)', async () => {
    setup();
    const dialog = await openWriteBack();
    expect(dialog).not.toHaveTextContent(/備份|清掉舊答案/);
  });

  it('"取消" closes the dialog without writing back (US3 AC-13)', async () => {
    const { registry } = setup();
    const dialog = await openWriteBack();
    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(writeBackDialog()).not.toBeInTheDocument();
    expect(registry.result.writeBack).not.toHaveBeenCalled();
    expect(screen.getByRole('main')).toHaveTextContent('尚未寫回');
  });
});

describe('TeacherResultsPage write-back result (FR-042, US3 AC-11, AC-12)', () => {
  async function writeBackWith(result: WriteBackResult) {
    const writeBack = vi.fn().mockResolvedValue(result);
    setup({ result: { writeBack } });
    const dialog = await openWriteBack();
    await userEvent.click(within(dialog).getByRole('button', { name: '寫回' }));
    return writeBack;
  }

  it('closes the dialog, writes back once and shows success with the cell count (US3 AC-11)', async () => {
    const writeBack = await writeBackWith({ ok: true, cellCount: 6 });
    expect(writeBack).toHaveBeenCalledTimes(1);
    expect(writeBackDialog()).not.toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('寫回成功'));
    expect(screen.getByRole('main')).toHaveTextContent('6 格');
    expect(screen.getByRole('main')).not.toHaveTextContent('尚未寫回');
  });

  it('shows failure with the returned reason (edge, US3 AC-12)', async () => {
    await writeBackWith({ ok: false, cellCount: 0, failureReason: '沒有編輯權限，無法寫回' });
    expect(writeBackDialog()).not.toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('寫回失敗'));
    expect(screen.getByRole('main')).toHaveTextContent('沒有編輯權限，無法寫回');
  });

  it('closes the dialog and shows an unexpected error in ErrorArea (edge, FR-009)', async () => {
    const writeBack = vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' });
    setup({ result: { writeBack } });
    const dialog = await openWriteBack();
    await userEvent.click(within(dialog).getByRole('button', { name: '寫回' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(writeBackDialog()).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('尚未寫回');
  });
});

describe('AppRouter browser back on T-Results (FR-014)', () => {
  it('only closes the open T-WriteBack without writing back (edge)', async () => {
    const opened = makeActivity({ questions: makeMixedQuestions().slice(0, 1), phase: 'OPEN', currentQuestion: 1 });
    const finished = { ...opened, phase: 'FINISHED' as const };
    const { registry } = setupRouter(opened, [], [makeQuestionResult()], {
      activity: { endQuestion: vi.fn().mockResolvedValue(finished) },
    });
    await walkToLive();
    await userEvent.click(screen.getByRole('button', { name: '結束這一題' }));
    await userEvent.click(screen.getByRole('button', { name: '結束並公布結果' }));
    await userEvent.click(await screen.findByRole('button', { name: '寫回 Google Sheets' }));
    expect(writeBackDialog()).toBeInTheDocument();
    goBack();
    expect(writeBackDialog()).not.toBeInTheDocument();
    expect(registry.result.writeBack).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '寫回 Google Sheets' })).toBeInTheDocument();
  });
});
