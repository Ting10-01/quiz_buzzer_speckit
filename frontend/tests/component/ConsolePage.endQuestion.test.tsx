// T069: T-EndConfirm and T-QuestionEnd of ConsolePage (US3 AC-6–9, FR-033, FR-034, FR-014).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity, QuestionResult, Submission } from '@quiz-buzzer/shared/entities';
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
  goBack,
  listItem,
  setupRouter,
  statValue,
  tableRows,
  walkToLive,
} from '../helpers/pageQueries';

/** Three groups (makeActivity), four mixed questions; question `n` in `phase`. */
function activityAt(n: number, phase: Activity['phase'] = 'OPEN'): Activity {
  return makeActivity({ questions: makeMixedQuestions(), phase, currentQuestion: n });
}

/** Group 2 submitted question `n`; groups 1 and 3 did not. */
function oneSubmission(n = 1): Submission[] {
  return [makeSubmission({ questionNumber: n, groupNumber: 2, answers: ['CPU', '作業系統'] })];
}

function allResults(overrides: Record<number, Partial<QuestionResult>> = {}): QuestionResult[] {
  return makeMixedQuestions().map((q) =>
    makeQuestionResult({ questionNumber: q.number, ...overrides[q.number] }),
  );
}

function setup(
  initial: ConsolePageState,
  submissions: Submission[] = oneSubmission(),
  overrides: FakeRegistryOverrides = {},
) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({
    ...overrides,
    activity: { ...overrides.activity },
    submission: { listSubmissions: vi.fn().mockResolvedValue(submissions), ...overrides.submission },
    result: {
      getAllResults: vi.fn().mockResolvedValue(allResults()),
      getQuestionResult: vi.fn().mockResolvedValue(makeQuestionResult()),
      ...overrides.result,
    },
  });
  const view = renderWithRegistry(<ConsoleHarness initial={initial} navigate={navigate} />, registry);
  return { navigate, registry, view };
}

const endDialog = () => screen.queryByRole('dialog', { name: /結束第 \d+ 題/ });

async function openEndDialog() {
  await userEvent.click(await screen.findByRole('button', { name: '結束這一題' }));
  const dialog = endDialog();
  if (!dialog) throw new Error('end dialog did not open');
  return dialog;
}

describe('ConsolePage T-EndConfirm (FR-033, US3 AC-6, AC-7)', () => {
  it('"結束這一題" opens the dialog with the submitted count and unsubmitted groups, without a service call', async () => {
    const { registry } = setup({ id: 'T-Live', activity: activityAt(1) });
    await vi.waitFor(() => expect(tableRows('答案列表')).toHaveLength(1));
    const dialog = await openEndDialog();
    expect(dialog).toHaveAccessibleName(/結束第 1 題/);
    expect(dialog).toHaveTextContent('1 組');
    expect(dialog).toHaveTextContent('第 1、3 組');
    expect(dialog).not.toHaveTextContent('結果頁');
    expect(within(dialog).getByRole('button', { name: '繼續作答' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '結束並公布結果' })).toBeInTheDocument();
    expect(registry.activity.endQuestion).not.toHaveBeenCalled();
  });

  it('also says the results page comes next on the last question (FR-033)', async () => {
    setup({ id: 'T-Live', activity: activityAt(4) }, oneSubmission(4));
    const dialog = await openEndDialog();
    expect(dialog).toHaveAccessibleName(/結束第 4 題/);
    expect(dialog).toHaveTextContent('結果頁');
  });

  it('does not show remaining time (SC-004)', async () => {
    setup({ id: 'T-Live', activity: activityAt(1) });
    const dialog = await openEndDialog();
    expect(dialog).not.toHaveTextContent(/還剩|剩餘|秒。結束後|提前/);
  });

  it('"繼續作答" closes the dialog and leaves T-Live and its data unchanged (US3 AC-7)', async () => {
    const { navigate, registry } = setup({ id: 'T-Live', activity: activityAt(1) });
    await vi.waitFor(() => expect(tableRows('答案列表')).toHaveLength(1));
    const dialog = await openEndDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: '繼續作答' }));
    expect(endDialog()).not.toBeInTheDocument();
    expect(registry.activity.endQuestion).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(tableRows('答案列表')).toHaveLength(1);
    expect(statValue('本題已送出')).toHaveTextContent('1 組');
  });
});

describe('ConsolePage T-EndConfirm "結束並公布結果" (US3 AC-8, AC-9)', () => {
  it('calls endQuestion(n) and goes to T-QuestionEnd, loading its result and the progress (US3 AC-8)', async () => {
    const ended = activityAt(1, 'QUESTION_ENDED');
    const endQuestion = vi.fn().mockResolvedValue(ended);
    const { navigate, registry } = setup({ id: 'T-Live', activity: activityAt(1) }, undefined, {
      activity: { endQuestion },
    });
    const dialog = await openEndDialog();
    vi.mocked(registry.result.getAllResults).mockClear();
    await userEvent.click(within(dialog).getByRole('button', { name: '結束並公布結果' }));
    expect(endQuestion).toHaveBeenCalledTimes(1);
    expect(endQuestion).toHaveBeenCalledWith(1);
    expect(navigate).toHaveBeenCalledWith({ id: 'T-QuestionEnd', activity: ended });
    await vi.waitFor(() => expect(registry.result.getQuestionResult).toHaveBeenCalledWith(1));
    expect(registry.result.getAllResults).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '開放第 2 題' })).toBeInTheDocument();
  });

  it('goes to T-Results when the last question ends (edge, US3 AC-9)', async () => {
    const finished = activityAt(4, 'FINISHED');
    const endQuestion = vi.fn().mockResolvedValue(finished);
    const { navigate } = setup({ id: 'T-Live', activity: activityAt(4) }, oneSubmission(4), {
      activity: { endQuestion },
    });
    const dialog = await openEndDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: '結束並公布結果' }));
    expect(endQuestion).toHaveBeenCalledWith(4);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Results', activity: finished });
  });

  it('closes the dialog first and shows an unexpected error on T-Live (edge, FR-009)', async () => {
    const endQuestion = vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' });
    const { navigate } = setup({ id: 'T-Live', activity: activityAt(1) }, undefined, {
      activity: { endQuestion },
    });
    const dialog = await openEndDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: '結束並公布結果' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(endDialog()).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '結束這一題' })).toBeInTheDocument();
  });
});

describe('ConsolePage T-QuestionEnd (FR-034)', () => {
  const winner = makeSubmission({ groupNumber: 2, answers: ['CPU', '作業系統'], judgement: 'ACCEPTED' });

  function questionEnd(result: QuestionResult, results: QuestionResult[] = allResults({ 1: result })) {
    return setup({ id: 'T-QuestionEnd', activity: activityAt(1, 'QUESTION_ENDED') }, [], {
      result: {
        getQuestionResult: vi.fn().mockResolvedValue(result),
        getAllResults: vi.fn().mockResolvedValue(results),
      },
    });
  }

  it('shows the winning group and its answers, the submitted count, progress and wins per group', async () => {
    const result = makeQuestionResult({
      questionNumber: 1,
      winner,
      submissions: [makeSubmission({ groupNumber: 1, judgement: 'REJECTED' }), { ...winner, rank: 2 }],
    });
    const { registry } = questionEnd(result);
    const region = await screen.findByRole('region', { name: '本題結果' });
    await vi.waitFor(() => expect(region).toHaveTextContent('第 2 組'));
    expect(region).toHaveTextContent('CPU');
    expect(region).toHaveTextContent('作業系統');
    expect(registry.result.getQuestionResult).toHaveBeenCalledWith(1);
    expect(statValue('本題已送出')).toHaveTextContent('2 組');
    await vi.waitFor(() => expect(listItem('題目進度', '第 1 題')).toHaveTextContent('第 2 組'));
    expect(listItem('各組搶到的題數', '第 2 組')).toHaveTextContent('1 題');
  });

  it('shows "沒有組別搶答成功" when groups submitted but none was accepted (edge)', async () => {
    const result = makeQuestionResult({
      questionNumber: 1,
      submissions: [makeSubmission({ groupNumber: 1, judgement: 'REJECTED' })],
    });
    questionEnd(result);
    const region = await screen.findByRole('region', { name: '本題結果' });
    await vi.waitFor(() => expect(region).toHaveTextContent('沒有組別搶答成功'));
    expect(statValue('本題已送出')).toHaveTextContent('1 組');
  });

  it('shows "沒有組別送出" when nobody submitted (edge)', async () => {
    questionEnd(makeQuestionResult({ questionNumber: 1 }));
    const region = await screen.findByRole('region', { name: '本題結果' });
    await vi.waitFor(() => expect(region).toHaveTextContent('沒有組別送出'));
    expect(statValue('本題已送出')).toHaveTextContent('0 組');
  });

  it('puts only "開放第 2 題" in the action bar, on the right (RD-09)', async () => {
    const { view } = questionEnd(makeQuestionResult({ questionNumber: 1 }));
    await screen.findByRole('button', { name: '開放第 2 題' });
    expect(actionBarSides(view.container)).toEqual({ left: [], right: ['開放第 2 題'] });
    expect(screen.queryByText(/剩餘時間|限時|連線分頁|離線/)).not.toBeInTheDocument();
  });

  it('"開放第 2 題" calls openQuestion(2) and goes back to T-Live', async () => {
    const opened = activityAt(2);
    const openQuestion = vi.fn().mockResolvedValue(opened);
    const navigate = vi.fn();
    const registry = createFakeRegistry({
      activity: { openQuestion },
      submission: { listSubmissions: vi.fn().mockResolvedValue([]) },
      result: {
        getQuestionResult: vi.fn().mockResolvedValue(makeQuestionResult()),
        getAllResults: vi.fn().mockResolvedValue(allResults()),
      },
    });
    renderWithRegistry(
      <ConsoleHarness
        initial={{ id: 'T-QuestionEnd', activity: activityAt(1, 'QUESTION_ENDED') }}
        navigate={navigate}
      />,
      registry,
    );
    await userEvent.click(await screen.findByRole('button', { name: '開放第 2 題' }));
    expect(openQuestion).toHaveBeenCalledWith(2);
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Live', activity: opened });
    await screen.findByRole('button', { name: '結束這一題' });
    expect(registry.submission.listSubmissions).toHaveBeenCalledWith(2);
  });

  it('stays on T-QuestionEnd and shows an unexpected error from openQuestion (edge, FR-009)', async () => {
    const openQuestion = vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' });
    const { navigate } = setup(
      { id: 'T-QuestionEnd', activity: activityAt(1, 'QUESTION_ENDED') },
      [],
      { activity: { openQuestion } },
    );
    await userEvent.click(await screen.findByRole('button', { name: '開放第 2 題' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '開放第 2 題' })).toBeInTheDocument();
  });
});

describe('AppRouter browser back on T-Live (FR-014)', () => {
  const opened = makeActivity({ questions: makeMixedQuestions().slice(0, 1), phase: 'OPEN', currentQuestion: 1 });

  it('only closes the open T-EndConfirm, like "繼續作答" (edge)', async () => {
    const { registry } = setupRouter(opened, [], [makeQuestionResult()]);
    await walkToLive();
    await userEvent.click(screen.getByRole('button', { name: '結束這一題' }));
    expect(endDialog()).toBeInTheDocument();
    goBack();
    expect(endDialog()).not.toBeInTheDocument();
    expect(registry.activity.endQuestion).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '結束這一題' })).toBeInTheDocument();
  });

  it('stays on T-Live when no dialog is open (edge)', async () => {
    setupRouter(opened, [], [makeQuestionResult()]);
    await walkToLive();
    goBack();
    expect(screen.getByRole('button', { name: '結束這一題' })).toBeInTheDocument();
  });
});
