// T081: S-Answer (FR-052–FR-054, FR-056a, FR-008, FR-009, US4 AC-5, AC-6, AC-10–AC-12).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import type { SubmissionService } from '../../src/services/interfaces';
import { makeActivity, makeMixedQuestions, makeSubmission } from '../helpers/fixtures';
import { renderStudentPage, studentEvents, studentRegistry } from '../helpers/studentHarness';

/** Question 1 is a group question with two sub-questions; question 3 is single. */
const openAt = (n: number): Activity =>
  makeActivity({ phase: 'OPEN', currentQuestion: n, questions: makeMixedQuestions() });

function setup(n = 1, submission: Partial<SubmissionService> = {}) {
  const events = studentEvents();
  const registry = studentRegistry(events, {
    submission,
    result: {
      getQuestionResult: vi.fn(() => new Promise<never>(() => {})),
      getAllResults: vi.fn(() => new Promise<never>(() => {})),
    },
  });
  const activity = openAt(n);
  const result = renderStudentPage({ id: 'S-Answer', groupNumber: 2, activity }, registry);
  return { ...result, events, registry, activity };
}

const field = (name: string) => screen.getByRole('textbox', { name });

describe('StudentPlayPage S-Answer', () => {
  it('shows the group, question number of total, type and text (FR-052)', () => {
    setup(1);
    expect(within(screen.getByRole('banner')).getByText('第 2 組')).toBeInTheDocument();
    expect(screen.getByText('第 1 題 / 共 4 題')).toBeInTheDocument();
    expect(screen.getByText(/題組/)).toBeInTheDocument();
    expect(screen.getByText('Group question one')).toBeInTheDocument();
  });

  it('has one answer field per sub-question, one submit button and one hint area (FR-052, FR-053, US4 AC-5)', () => {
    setup(1);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(field('第 1 小題')).toBeInTheDocument();
    expect(field('第 2 小題')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '整組送出' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '整組送出' })).toBeEnabled();
    expect(screen.getAllByRole('status', { name: '送出提示' })).toHaveLength(1);
  });

  it('has a single answer field for a single question', () => {
    setup(3);
    expect(screen.getByText('第 3 題 / 共 4 題')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(field('答案')).toBeInTheDocument();
  });

  it('submits without a group and shows the answers waiting for a judgement (US4 AC-6)', async () => {
    const sent = makeSubmission({ questionNumber: 1, groupNumber: 2, answers: ['CPU', '作業系統'] });
    const { registry, navigate, activity } = setup(1, {
      submitAnswer: vi.fn().mockResolvedValue(sent),
    });
    await userEvent.type(field('第 1 小題'), 'CPU');
    await userEvent.type(field('第 2 小題'), '作業系統');
    await userEvent.click(screen.getByRole('button', { name: '整組送出' }));
    expect(registry.submission.submitAnswer).toHaveBeenCalledWith(1, ['CPU', '作業系統']);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Submitted', groupNumber: 2, activity, submission: sent });
    expect(await screen.findByText('等待老師判定')).toBeInTheDocument();
    const answers = screen.getByRole('region', { name: '本組送出的答案' });
    expect(answers).toHaveTextContent('CPU');
    expect(answers).toHaveTextContent('作業系統');
  });

  it('goes to S-Submitted with the groupmate’s answers when onGroupSubmitted fires (S7, FR-056a, US4 AC-12)', () => {
    const { events, navigate, activity } = setup(1);
    expect(events.groupSubmitted.listeners.size).toBe(1);
    const teammate = makeSubmission({ questionNumber: 1, groupNumber: 2, answers: ['GPU', '驅動程式'] });
    events.groupSubmitted.emit(teammate);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Submitted', groupNumber: 2, activity, submission: teammate });
    expect(screen.getByText('等待老師判定')).toBeInTheDocument();
    const answers = screen.getByRole('region', { name: '本組送出的答案' });
    expect(answers).toHaveTextContent('GPU');
    expect(answers).toHaveTextContent('驅動程式');
  });

  it('stays and shows a ValidationError beside the first answer field (edge, FR-008, US4 AC-10)', async () => {
    const { navigate } = setup(1, {
      submitAnswer: vi.fn().mockResolvedValue({ field: 'answers.0', message: '模擬：驗證失敗' }),
    });
    await userEvent.type(field('第 1 小題'), 'CPU');
    await userEvent.click(screen.getByRole('button', { name: '整組送出' }));
    await vi.waitFor(() => expect(field('第 1 小題')).toHaveAccessibleDescription('模擬：驗證失敗'));
    expect(field('第 2 小題')).not.toHaveAccessibleDescription('模擬：驗證失敗');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(field('第 1 小題')).toHaveValue('CPU');
  });

  it('keeps the typed answers and shows an unexpected error in the error area (FR-009)', async () => {
    const { navigate } = setup(1, {
      submitAnswer: vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' }),
    });
    await userEvent.type(field('第 1 小題'), 'CPU');
    await userEvent.type(field('第 2 小題'), 'OS');
    await userEvent.click(screen.getByRole('button', { name: '整組送出' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(field('第 1 小題')).toHaveValue('CPU');
    expect(field('第 2 小題')).toHaveValue('OS');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes to S-QuestionDone and loads the question result when QUESTION_ENDED is notified', () => {
    const { events, navigate, registry, activity } = setup(1);
    const ended = { ...activity, phase: 'QUESTION_ENDED' as const };
    events.phase.emit(ended);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-QuestionDone', groupNumber: 2, activity: ended });
    expect(registry.result.getQuestionResult).toHaveBeenCalledWith(1);
  });

  it('goes to S-Results when FINISHED is notified (last question)', () => {
    const { events, navigate, activity } = setup(4);
    events.phase.emit({ ...activity, phase: 'FINISHED' });
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Results', groupNumber: 2 });
  });

  it('shows nothing about other groups (FR-054, US4 AC-11)', () => {
    setup(1);
    expect(screen.queryByText(/第 [13-9] 組/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('等待老師判定')).not.toBeInTheDocument();
  });
});
