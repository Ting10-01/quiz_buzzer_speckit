// T083: S-QuestionDone (FR-057, C-2, spec Edge Cases).
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Activity, QuestionResult } from '@quiz-buzzer/shared/entities';
import {
  makeActivity,
  makeMixedQuestions,
  makeQuestionResult,
  makeSubmission,
} from '../helpers/fixtures';
import { listItem, statValue } from '../helpers/pageQueries';
import { renderStudentPage, studentEvents, studentRegistry } from '../helpers/studentHarness';

const endedAt = (n: number): Activity =>
  makeActivity({ phase: 'QUESTION_ENDED', currentQuestion: n, questions: makeMixedQuestions() });

/** Question 1: group 3 won; group 2 (this tab) submitted second. */
function wonByGroup3(): QuestionResult {
  const winner = makeSubmission({ groupNumber: 3, answers: ['CPU', '作業系統'], rank: 1, judgement: 'ACCEPTED' });
  const mine = makeSubmission({ groupNumber: 2, answers: ['GPU', 'OS'], rank: 2, judgement: 'UNJUDGED' });
  return makeQuestionResult({ questionNumber: 1, winner, submissions: [winner, mine] });
}

function setup(result: QuestionResult, all: QuestionResult[] = [result], n = 1) {
  const events = studentEvents();
  const registry = studentRegistry(events, {
    result: {
      getQuestionResult: vi.fn().mockResolvedValue(result),
      getAllResults: vi.fn().mockResolvedValue(all),
    },
  });
  const activity = endedAt(n);
  const rendered = renderStudentPage({ id: 'S-QuestionDone', groupNumber: 2, activity }, registry);
  return { ...rendered, events, registry, activity };
}

const questionResult = () => screen.getByRole('region', { name: '本題結果' });
const myAnswers = () => screen.getByRole('region', { name: '本組的答案' });

describe('StudentPlayPage S-QuestionDone', () => {
  it('loads the question result and all results (C-2)', async () => {
    const { registry } = setup(wonByGroup3());
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('第 3 組'));
    expect(registry.result.getQuestionResult).toHaveBeenCalledWith(1);
    expect(registry.result.getAllResults).toHaveBeenCalledTimes(1);
  });

  it('shows the winner, the submission count and this group’s answers (FR-057)', async () => {
    setup(wonByGroup3());
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('第 3 組'));
    expect(questionResult()).toHaveTextContent('CPU');
    expect(questionResult()).toHaveTextContent('作業系統');
    expect(statValue('本題已送出')).toHaveTextContent('2 組');
    expect(myAnswers()).toHaveTextContent('GPU');
    expect(myAnswers()).toHaveTextContent('OS');
    expect(within(screen.getByRole('banner')).getByText('第 2 組')).toBeInTheDocument();
  });

  it('shows "沒有組別搶答成功" when nobody was accepted (edge)', async () => {
    const rejected = makeSubmission({ groupNumber: 4, rank: 1, judgement: 'REJECTED' });
    setup(makeQuestionResult({ questionNumber: 1, submissions: [rejected] }));
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('沒有組別搶答成功'));
    expect(myAnswers()).toHaveTextContent('本組沒有送出');
  });

  it('shows "沒有組別送出" when no group submitted (edge)', async () => {
    setup(makeQuestionResult({ questionNumber: 1 }));
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('沒有組別送出'));
    expect(statValue('本題已送出')).toHaveTextContent('0 組');
    expect(myAnswers()).toHaveTextContent('本組沒有送出');
  });

  it('shows question progress from getAllResults (FR-057, C-2)', async () => {
    const q1 = wonByGroup3();
    setup(q1, [q1, makeQuestionResult({ questionNumber: 2 })]);
    await vi.waitFor(() => expect(listItem('題目進度', '第 1 題')).toHaveTextContent('第 3 組'));
    expect(listItem('題目進度', '第 2 題')).toHaveTextContent('還沒開放');
  });

  it('renders the returned results as they are, without filtering other groups (FR-057, C-2)', async () => {
    setup(wonByGroup3());
    // The winner is another group; the page shows whatever the result service returned.
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('第 3 組'));
  });

  it('offers no buttons', async () => {
    setup(wonByGroup3());
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('第 3 組'));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('goes to S-Answer when the next question opens (FR-006)', async () => {
    const { events, navigate, activity } = setup(wonByGroup3());
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('第 3 組'));
    const opened = { ...activity, phase: 'OPEN' as const, currentQuestion: 2 };
    events.phase.emit(opened);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Answer', groupNumber: 2, activity: opened });
    expect(screen.getByText('第 2 題 / 共 4 題')).toBeInTheDocument();
  });

  it('stays without errors and keeps the question result when null is notified (T152, FR-026, edge)', async () => {
    const { events, navigate } = setup(wonByGroup3());
    await vi.waitFor(() => expect(questionResult()).toHaveTextContent('第 3 組'));
    expect(() => events.phase.emit(null)).not.toThrow();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('第 1 題已結束')).toBeInTheDocument();
    expect(questionResult()).toHaveTextContent('CPU');
    expect(statValue('本題已送出')).toHaveTextContent('2 組');
    expect(myAnswers()).toHaveTextContent('GPU');
  });

  it('shows an unexpected error from the result service in the error area (FR-009)', async () => {
    const events = studentEvents();
    const registry = studentRegistry(events, {
      result: {
        getQuestionResult: vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' }),
        getAllResults: vi.fn().mockResolvedValue([]),
      },
    });
    renderStudentPage({ id: 'S-QuestionDone', groupNumber: 2, activity: endedAt(1) }, registry);
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
  });
});
