// T068: T-Lobby "開放第 1 題" and the T-Live view of ConsolePage (US3 AC-1–5, FR-030–FR-032a).
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity, Submission } from '@quiz-buzzer/shared/entities';
import { ConsoleHarness, type ConsolePageState } from '../helpers/consoleHarness';
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
import {
  actionBarSides,
  listItem,
  statValue,
  tableRows,
  textWithoutButtons,
} from '../helpers/pageQueries';

/** Three groups (makeActivity), four mixed questions; question `n` is open. */
function openActivity(n = 1, overrides: Partial<Activity> = {}): Activity {
  return makeActivity({
    questions: makeMixedQuestions(),
    phase: 'OPEN',
    currentQuestion: n,
    ...overrides,
  });
}

/** Question 1 with groups 2 and 1 submitted, both PENDING. */
function pendingSubmissions(): Submission[] {
  return [
    makeSubmission({ groupNumber: 2, answers: ['CPU', '作業系統'], rank: 1, elapsedMs: 6204 }),
    makeSubmission({ groupNumber: 1, answers: ['GPU', '驅動程式'], rank: 2, elapsedMs: 8517 }),
  ];
}

function setup(
  initial: ConsolePageState,
  submissions: Submission[] = pendingSubmissions(),
  overrides: FakeRegistryOverrides = {},
) {
  const navigate = vi.fn();
  let notifySubmissions: (next: Submission[]) => void = () => {};
  const unsubscribeSubmissions = vi.fn();
  const registry = createFakeRegistry({
    ...overrides,
    activity: { openQuestion: vi.fn(), ...overrides.activity },
    submission: {
      listSubmissions: vi.fn().mockResolvedValue(submissions),
      onSubmissionsChange: vi.fn((_q: number, listener: (next: Submission[]) => void) => {
        notifySubmissions = listener;
        return unsubscribeSubmissions;
      }),
      ...overrides.submission,
    },
    result: {
      getAllResults: vi.fn().mockResolvedValue(
        makeMixedQuestions().map((q) => makeQuestionResult({ questionNumber: q.number })),
      ),
      getQuestionResult: vi.fn().mockResolvedValue(makeQuestionResult()),
      ...overrides.result,
    },
  });
  const view = renderWithRegistry(<ConsoleHarness initial={initial} navigate={navigate} />, registry);
  return {
    navigate,
    registry,
    view,
    unsubscribeSubmissions,
    notifySubmissions: (next: Submission[]) => act(() => notifySubmissions(next)),
  };
}

const live = (activity = openActivity()): ConsolePageState => ({ id: 'T-Live', activity });

/** Waits until the answer list shows `count` data rows. */
async function rows(count: number) {
  await vi.waitFor(() => expect(tableRows('答案列表')).toHaveLength(count));
  return tableRows('答案列表');
}

const button = (row: HTMLElement, name: '接受' | '不接受') =>
  within(row).getByRole('button', { name });

describe('ConsolePage T-Lobby "開放第 1 題" (US3 AC-1)', () => {
  it('calls openQuestion(1) and goes to T-Live with the returned activity', async () => {
    const opened = openActivity(1);
    const openQuestion = vi.fn().mockResolvedValue(opened);
    const { navigate } = setup(
      { id: 'T-Lobby', activity: makeActivity({ questions: makeMixedQuestions() }) },
      undefined,
      { activity: { openQuestion } },
    );
    await userEvent.click(screen.getByRole('button', { name: '開放第 1 題' }));
    expect(openQuestion).toHaveBeenCalledTimes(1);
    expect(openQuestion).toHaveBeenCalledWith(1);
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Live', activity: opened });
    expect(await screen.findByRole('button', { name: '結束這一題' })).toBeInTheDocument();
  });

  it('stays on T-Lobby and shows an unexpected error in ErrorArea (edge, FR-009)', async () => {
    const openQuestion = vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' });
    const { navigate } = setup(
      { id: 'T-Lobby', activity: makeActivity({ questions: makeMixedQuestions() }) },
      undefined,
      { activity: { openQuestion } },
    );
    await userEvent.click(screen.getByRole('button', { name: '開放第 1 題' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '修改設定' })).toBeInTheDocument();
  });
});

describe('ConsolePage T-Live loading and display (FR-030, US3 AC-1)', () => {
  it('lists the submissions of the open question and subscribes to their changes', async () => {
    const { registry } = setup(live(openActivity(2)));
    await rows(2);
    expect(registry.submission.listSubmissions).toHaveBeenCalledWith(2);
    expect(registry.submission.onSubmissionsChange).toHaveBeenCalledWith(2, expect.any(Function));
    expect(registry.result.getAllResults).toHaveBeenCalled();
  });

  it('shows the question number and total, type, text, submitted count, unsubmitted groups and ended count', async () => {
    setup(live());
    await rows(2);
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('第 1 題 / 共 4 題');
    expect(main).toHaveTextContent('題組・2 小題');
    expect(main).toHaveTextContent('Group question one');
    expect(statValue('本題已送出')).toHaveTextContent('2 組');
    expect(statValue('還沒送出')).toHaveTextContent('第 3 組');
    expect(statValue('還沒送出')).not.toHaveTextContent('第 1 組');
    expect(statValue('已結束')).toHaveTextContent('0 / 4 題');
  });

  it('shows the question progress and the questions won by each group', async () => {
    const results = [
      makeQuestionResult({
        questionNumber: 1,
        submissions: [makeSubmission({ groupNumber: 3, judgement: 'ACCEPTED' })],
        winner: makeSubmission({ groupNumber: 3, judgement: 'ACCEPTED' }),
      }),
      makeQuestionResult({ questionNumber: 2 }),
      makeQuestionResult({ questionNumber: 3 }),
      makeQuestionResult({ questionNumber: 4 }),
    ];
    setup(live(openActivity(2)), pendingSubmissions(), {
      result: { getAllResults: vi.fn().mockResolvedValue(results) },
    });
    await vi.waitFor(() => expect(listItem('題目進度', '第 1 題')).toHaveTextContent('第 3 組'));
    expect(listItem('題目進度', '第 2 題')).toHaveTextContent('進行中');
    expect(listItem('各組搶到的題數', '第 3 組')).toHaveTextContent('1 題');
    expect(listItem('各組搶到的題數', '第 1 組')).toHaveTextContent('0 題');
    expect(statValue('已結束')).toHaveTextContent('1 / 4 題');
  });

  it('does not show remaining time, time limits or connected tabs (SC-004)', async () => {
    setup(live());
    await rows(2);
    expect(screen.queryByText(/剩餘時間|時間到|限時|連線分頁|離線|在線/)).not.toBeInTheDocument();
  });

  it('puts only "結束這一題" in the action bar, on the right (RD-09)', async () => {
    const { view } = setup(live());
    await rows(2);
    expect(actionBarSides(view.container)).toEqual({ left: [], right: ['結束這一題'] });
  });
});

describe('ConsolePage T-Live answer list (FR-031, FR-032, US3 AC-2)', () => {
  it('lists every submission in rank order with rank, group, answers, elapsed time and judgement', async () => {
    const [first, second] = pendingSubmissions();
    // Given out of order: the page must order by rank.
    setup(live(), [second, first]);
    const [row1, row2] = await rows(2);
    expect(row1).toHaveTextContent('#1');
    expect(row1).toHaveTextContent('第 2 組');
    expect(row1).toHaveTextContent('CPU');
    expect(row1).toHaveTextContent('作業系統');
    expect(row1).toHaveTextContent('6.204 秒');
    expect(row1).toHaveTextContent('待判定');
    expect(row2).toHaveTextContent('#2');
    expect(row2).toHaveTextContent('第 1 組');
    expect(row2).toHaveTextContent('8.517 秒');
  });

  it('enables "接受" and "不接受" only on the earliest PENDING row (US3 AC-2, C-4)', async () => {
    setup(live());
    const [row1, row2] = await rows(2);
    expect(button(row1, '接受')).toBeEnabled();
    expect(button(row1, '不接受')).toBeEnabled();
    expect(button(row2, '接受')).toBeDisabled();
    expect(button(row2, '不接受')).toBeDisabled();
  });

  it('replaces the list with the snapshot from onSubmissionsChange', async () => {
    const { notifySubmissions } = setup(live(), []);
    await rows(0);
    notifySubmissions(pendingSubmissions());
    const [row1] = await rows(2);
    expect(row1).toHaveTextContent('第 2 組');
    expect(statValue('本題已送出')).toHaveTextContent('2 組');
  });

  it('unsubscribes from onSubmissionsChange when unmounted', async () => {
    const { view, unsubscribeSubmissions } = setup(live());
    await rows(2);
    view.unmount();
    expect(unsubscribeSubmissions).toHaveBeenCalledTimes(1);
  });

  it('shows an empty list and every group as unsubmitted when nobody submitted (edge, US3 AC-5)', async () => {
    setup(live(openActivity(3)), []);
    await rows(0);
    expect(statValue('本題已送出')).toHaveTextContent('0 組');
    expect(statValue('還沒送出')).toHaveTextContent('第 1、2、3 組');
  });

  it('disables every judge button once every row is rejected, leaving only "結束這一題" (edge)', async () => {
    const rejected = pendingSubmissions().map((s) => ({ ...s, judgement: 'REJECTED' as const }));
    setup(live(), rejected);
    const all = await rows(2);
    for (const row of all) {
      expect(textWithoutButtons(row)).toContain('不接受');
      expect(button(row, '接受')).toBeDisabled();
      expect(button(row, '不接受')).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: '結束這一題' })).toBeEnabled();
  });
});

describe('ConsolePage T-Live judging (FR-032a, US3 AC-3, AC-4)', () => {
  it('"不接受" judges the earliest row, stays on T-Live and makes the next row judgeable (US3 AC-4)', async () => {
    const [first, second] = pendingSubmissions();
    const judge = vi.fn().mockResolvedValue({
      submissions: [{ ...first, judgement: 'REJECTED' }, second],
      activity: openActivity(1),
    });
    const { navigate } = setup(live(), [first, second], { submission: { judge } });
    const [row1] = await rows(2);
    await userEvent.click(button(row1, '不接受'));
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge).toHaveBeenCalledWith(1, 2, 'REJECTED');
    await vi.waitFor(() => expect(textWithoutButtons(tableRows('答案列表')[0])).toContain('不接受'));
    const [after1, after2] = tableRows('答案列表');
    expect(after1).not.toHaveTextContent('待判定');
    expect(after2).toHaveTextContent('待判定');
    expect(button(after1, '接受')).toBeDisabled();
    expect(button(after1, '不接受')).toBeDisabled();
    expect(button(after2, '接受')).toBeEnabled();
    expect(button(after2, '不接受')).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('"接受" ending the question goes to T-QuestionEnd and loads its result and the progress (US3 AC-3)', async () => {
    const [first, second] = pendingSubmissions();
    const ended = openActivity(1, { phase: 'QUESTION_ENDED' });
    const judge = vi.fn().mockResolvedValue({
      submissions: [{ ...first, judgement: 'ACCEPTED' }, { ...second, judgement: 'UNJUDGED' }],
      activity: ended,
    });
    const { navigate, registry } = setup(live(), [first, second], { submission: { judge } });
    const [row1] = await rows(2);
    vi.mocked(registry.result.getAllResults).mockClear();
    await userEvent.click(button(row1, '接受'));
    expect(judge).toHaveBeenCalledWith(1, 2, 'ACCEPTED');
    expect(navigate).toHaveBeenCalledWith({ id: 'T-QuestionEnd', activity: ended });
    await vi.waitFor(() => expect(registry.result.getQuestionResult).toHaveBeenCalledWith(1));
    expect(registry.result.getAllResults).toHaveBeenCalled();
  });

  it('"接受" on the last question goes straight to T-Results (edge, FR-032a)', async () => {
    const [first, second] = pendingSubmissions().map((s) => ({ ...s, questionNumber: 4 }));
    const finished = openActivity(4, { phase: 'FINISHED' });
    const judge = vi.fn().mockResolvedValue({
      submissions: [{ ...first, judgement: 'ACCEPTED' }, { ...second, judgement: 'UNJUDGED' }],
      activity: finished,
    });
    const { navigate } = setup(live(openActivity(4)), [first, second], { submission: { judge } });
    const [row1] = await rows(2);
    await userEvent.click(button(row1, '接受'));
    expect(judge).toHaveBeenCalledWith(4, 2, 'ACCEPTED');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Results', activity: finished });
  });

  it('stays on T-Live with the list unchanged and shows an unexpected error from judge (edge, FR-009)', async () => {
    const judge = vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' });
    const { navigate } = setup(live(), undefined, { submission: { judge } });
    const [row1] = await rows(2);
    await userEvent.click(button(row1, '不接受'));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
    const [after1] = tableRows('答案列表');
    expect(after1).toHaveTextContent('待判定');
    expect(button(after1, '不接受')).toBeEnabled();
  });

  it('clears the error after the next successful judge (FR-009)', async () => {
    const [first, second] = pendingSubmissions();
    const judge = vi
      .fn()
      .mockRejectedValueOnce({ message: '模擬：連不上伺服器' })
      .mockResolvedValueOnce({
        submissions: [{ ...first, judgement: 'REJECTED' }, second],
        activity: openActivity(1),
      });
    setup(live(), [first, second], { submission: { judge } });
    const [row1] = await rows(2);
    await userEvent.click(button(row1, '不接受'));
    await screen.findByRole('alert');
    await userEvent.click(button(tableRows('答案列表')[0], '不接受'));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
