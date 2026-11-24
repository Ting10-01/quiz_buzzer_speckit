// T082: S-Submitted waiting for a judgement and not accepted
// (FR-055, FR-056, FR-056a S10, FR-061, US4 AC-7–AC-9).
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Activity, Judgement, Submission } from '@quiz-buzzer/shared/entities';
import { makeActivity, makeMixedQuestions, makeSubmission } from '../helpers/fixtures';
import {
  joinFromHome,
  renderStudentPage,
  renderStudentRouter,
  studentEvents,
  studentRegistry,
} from '../helpers/studentHarness';

const openAt = (n: number): Activity =>
  makeActivity({ phase: 'OPEN', currentQuestion: n, questions: makeMixedQuestions() });

const sent = (judgement: Judgement = 'PENDING'): Submission =>
  makeSubmission({ questionNumber: 1, groupNumber: 2, answers: ['CPU', '作業系統'], judgement });

function setup(initial: Submission = sent(), n = 1) {
  const events = studentEvents();
  const registry = studentRegistry(events, {
    result: {
      getQuestionResult: vi.fn(() => new Promise<never>(() => {})),
      getAllResults: vi.fn(() => new Promise<never>(() => {})),
    },
  });
  const activity = openAt(n);
  const result = renderStudentPage(
    { id: 'S-Submitted', groupNumber: 2, activity, submission: initial },
    registry,
  );
  return { ...result, events, registry, activity };
}

const REJECTED_TEXT = '老師沒有接受本組的答案';

function expectNoWayToResubmit() {
  expect(screen.queryByRole('button', { name: '整組送出' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
}

describe('StudentPlayPage S-Submitted', () => {
  it('waits for a judgement, showing the group’s answers (FR-055)', () => {
    const { events } = setup();
    expect(screen.getByText('等待老師判定')).toBeInTheDocument();
    const answers = screen.getByRole('region', { name: '本組送出的答案' });
    expect(answers).toHaveTextContent('CPU');
    expect(answers).toHaveTextContent('作業系統');
    expect(events.judgement.listeners.size).toBe(1);
    expectNoWayToResubmit();
  });

  it('stays and shows "not accepted" with the answers when REJECTED arrives (FR-056, US4 AC-8, edge)', () => {
    const { events, navigate } = setup();
    events.judgement.emit(sent('REJECTED'));
    expect(screen.getByText(REJECTED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('等待老師判定')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '本組送出的答案' })).toHaveTextContent('CPU');
    expectNoWayToResubmit();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not switch by itself on ACCEPTED and shows no accepted state (FR-055, US4 AC-7)', () => {
    const { events, navigate } = setup();
    events.judgement.emit(sent('ACCEPTED'));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText('已接受')).not.toBeInTheDocument();
    expect(screen.queryByText(REJECTED_TEXT)).not.toBeInTheDocument();
  });

  it('goes to S-QuestionDone when QUESTION_ENDED follows the acceptance (US4 AC-7)', () => {
    const { events, navigate, activity, registry } = setup();
    events.judgement.emit(sent('ACCEPTED'));
    const ended = { ...activity, phase: 'QUESTION_ENDED' as const };
    events.phase.emit(ended);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-QuestionDone', groupNumber: 2, activity: ended });
    expect(registry.result.getQuestionResult).toHaveBeenCalledWith(1);
  });

  it('goes to S-Results when FINISHED follows the acceptance of the last question (US4 AC-7)', () => {
    const { events, navigate, activity } = setup(sent(), 4);
    events.judgement.emit(sent('ACCEPTED'));
    events.phase.emit({ ...activity, phase: 'FINISHED' });
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Results', groupNumber: 2 });
  });

  it.each([
    ['QUESTION_ENDED', 1, 'S-QuestionDone'],
    ['FINISHED', 4, 'S-Results'],
  ] as const)(
    'moves on from the not-accepted state when %s is notified (US4 AC-9)',
    (phase, n, target) => {
      const { events, navigate, activity } = setup(sent(), n);
      events.judgement.emit(sent('REJECTED'));
      events.phase.emit({ ...activity, phase });
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ id: target, groupNumber: 2 }));
    },
  );

  it('starts in the not-accepted state for a REJECTED submission passed from S-Join (S10, edge)', () => {
    setup(sent('REJECTED'));
    expect(screen.getByText(REJECTED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('等待老師判定')).not.toBeInTheDocument();
    expectNoWayToResubmit();
  });

  it.each([
    ['waiting for a judgement', 'PENDING', '等待老師判定'],
    ['not accepted', 'REJECTED', REJECTED_TEXT],
  ] as const)(
    'stays without errors and keeps the sent answers when null is notified while %s (T152, FR-026, edge)',
    (_state, judgement, heading) => {
      void _state;
      const { events, navigate } = setup(sent(judgement));
      expect(() => events.phase.emit(null)).not.toThrow();
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByText(heading)).toBeInTheDocument();
      const answers = screen.getByRole('region', { name: '本組送出的答案' });
      expect(answers).toHaveTextContent('CPU');
      expect(answers).toHaveTextContent('作業系統');
    },
  );

  it('shows nothing about other groups (FR-054)', () => {
    setup();
    expect(screen.queryByText(/第 [13-9] 組/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('unsubscribes from judgements and phase changes when it unmounts', () => {
    const { events, view } = setup();
    view.unmount();
    expect(events.judgement.listeners.size).toBe(0);
    expect(events.phase.listeners.size).toBe(0);
  });
});

describe('S-Submitted inside AppRouter: mock judgement controls (FR-061)', () => {
  function setupRouter(judgement: Judgement) {
    const events = studentEvents();
    const opened = openAt(1);
    const registry = studentRegistry(events, {
      isMockMode: true,
      judgementControl: { simulateJudgement: vi.fn(() => new Promise<never>(() => {})) },
      activity: {
        getCurrentActivity: vi.fn().mockResolvedValue(opened),
        joinGroup: vi.fn().mockResolvedValue(opened),
      },
      submission: { getGroupSubmission: vi.fn().mockResolvedValue(sent(judgement)) },
    });
    renderStudentRouter(registry);
    return { events };
  }

  it('shows "模擬：接受" and "模擬：不接受" only while waiting for a judgement', async () => {
    const { events } = setupRouter('PENDING');
    await joinFromHome(2);
    expect(await screen.findByText('等待老師判定')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模擬：接受' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模擬：不接受' })).toBeInTheDocument();
    events.judgement.emit(sent('REJECTED'));
    expect(screen.getByText(REJECTED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '模擬：接受' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '模擬：不接受' })).not.toBeInTheDocument();
  });

  it('hides them when S-Submitted starts not accepted (S10, edge)', async () => {
    setupRouter('REJECTED');
    await joinFromHome(2);
    expect(await screen.findByText(REJECTED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '模擬：接受' })).not.toBeInTheDocument();
  });
});
