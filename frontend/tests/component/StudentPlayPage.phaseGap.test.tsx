// Issue #20: a phase change that arrives after a view navigated but before the next view
// subscribed to onPhaseChange. The old view ignores it and the new view never hears it, so
// the next view must check the current activity once it has subscribed ("階段推動的切換").
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { makeActivity, makeGroups, makeMixedQuestions } from '../helpers/fixtures';
import {
  renderStudentPage,
  studentEvents,
  studentRegistry,
  type StudentPlayState,
} from '../helpers/studentHarness';

const at = (phase: Activity['phase'], currentQuestion?: number): Activity =>
  makeActivity({ phase, currentQuestion, questions: makeMixedQuestions(), groups: makeGroups([3, 2, 0]) });

/**
 * Renders the page with an activity service whose getCurrentActivity() answers the latest
 * notified activity, then notifies `changes` back to back, before React re-renders.
 */
function notifyInTheGap(initial: StudentPlayState, changes: Activity[]) {
  const events = studentEvents();
  let latest: Activity | null = initial.activity;
  const registry = studentRegistry(events, {
    activity: { getCurrentActivity: vi.fn(() => Promise.resolve(latest)) },
    result: {
      getQuestionResult: vi.fn(() => new Promise<never>(() => {})),
      getAllResults: vi.fn(() => new Promise<never>(() => {})),
    },
  });
  const rendered = renderStudentPage(initial, registry);
  act(() => {
    for (const next of changes) {
      latest = next;
      events.phase.listeners.forEach((listener) => listener(next));
    }
  });
  return rendered;
}

describe('StudentPlayPage phase changes between two views (#20)', () => {
  it('S-Wait: question 1 opens and ends at once → S-QuestionDone', async () => {
    const ended = at('QUESTION_ENDED', 1);
    const { navigate } = notifyInTheGap({ id: 'S-Wait', groupNumber: 2, activity: at('PREPARING') }, [
      at('OPEN', 1),
      ended,
    ]);
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenLastCalledWith({ id: 'S-QuestionDone', groupNumber: 2, activity: ended }),
    );
    expect(screen.getByRole('heading', { name: '第 1 題已結束' })).toBeInTheDocument();
  });

  it('S-Answer: question 1 ends and question 2 opens at once → S-Answer for question 2', async () => {
    const opened = at('OPEN', 2);
    const { navigate } = notifyInTheGap({ id: 'S-Answer', groupNumber: 2, activity: at('OPEN', 1) }, [
      at('QUESTION_ENDED', 1),
      opened,
    ]);
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenLastCalledWith({ id: 'S-Answer', groupNumber: 2, activity: opened }),
    );
    expect(screen.getByText(/第 2 題/)).toBeInTheDocument();
  });

  it('S-QuestionDone: question 2 opens and ends at once → S-QuestionDone for question 2', async () => {
    const ended = at('QUESTION_ENDED', 2);
    const { navigate } = notifyInTheGap(
      { id: 'S-QuestionDone', groupNumber: 2, activity: at('QUESTION_ENDED', 1) },
      [at('OPEN', 2), ended],
    );
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenLastCalledWith({ id: 'S-QuestionDone', groupNumber: 2, activity: ended }),
    );
    expect(screen.getByRole('heading', { name: '第 2 題已結束' })).toBeInTheDocument();
  });
});
