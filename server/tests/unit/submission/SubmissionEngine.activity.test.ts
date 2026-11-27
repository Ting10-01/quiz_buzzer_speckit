import { describe, expect, it, vi } from 'vitest';
import type { ActivityManager } from '../../../src/activity/ActivityManager.js';
import type { ActivityState, ActivityStore } from '../../../src/activity/ActivityStore.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { SubmissionEngine } from '../../../src/submission/SubmissionEngine.js';
import type { SubmissionNotifier } from '../../../src/submission/SubmissionNotifier.js';
import { SubmissionStore } from '../../../src/submission/SubmissionStore.js';
import { SubmissionVisibility } from '../../../src/submission/SubmissionVisibility.js';
import { activityState } from '../../helpers/activityState.js';
import { submissionRecord } from '../../helpers/submissionRecord.js';

// data-model section 4 "SubmissionEngine.onActivityChange"; REQ-SUB-14.
// A fake ActivityStore: the test sets the state current() returns, then calls the subscribed listener
// with a version number, as 004's ActivityStore.commit does.
function fakeActivityStore() {
  let state: ActivityState | null = null;
  let version = 0;
  const listeners = new Set<(version: number) => void>();
  const store = {
    current: () => state,
    version: () => version,
    subscribe: (listener: (version: number) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    store: store as unknown as ActivityStore,
    commit(next: ActivityState | null) {
      state = next;
      version += 1;
      for (const listener of [...listeners]) listener(version);
    },
  };
}

function setup() {
  const activity = fakeActivityStore();
  const submissions = new SubmissionStore();
  const closeQuestion = vi.spyOn(submissions, 'closeQuestion');
  const notifier = {
    submissionsChanged: vi.fn(),
    groupSubmitted: vi.fn(),
    judged: vi.fn(),
  } as unknown as SubmissionNotifier & { submissionsChanged: ReturnType<typeof vi.fn> };
  const manager = { endQuestion: vi.fn(), snapshot: vi.fn() } as unknown as ActivityManager;
  const engine = new SubmissionEngine(
    submissions,
    new SubmissionVisibility(),
    notifier,
    activity.store,
    manager,
    new SequenceClock(),
  );
  // What submissionRoutes does (T011): ActivityStore.subscribe registers onActivityChange.
  activity.store.subscribe((version) => engine.onActivityChange(version));
  return { activity, submissions, closeQuestion, notifier };
}

const open = (n: number) => activityState({ phase: 'OPEN', currentQuestion: n, openedAt: new Map([[n, 1000]]) });

describe('SubmissionEngine.onActivityChange', () => {
  it('closes question n and notifies the teacher list when it ends (QUESTION_ENDED)', () => {
    const { activity, submissions, closeQuestion, notifier } = setup();
    activity.commit(open(1));
    submissions.append(submissionRecord({ questionNumber: 1, groupNumber: 1, rank: 1 }));
    submissions.append(submissionRecord({ questionNumber: 1, groupNumber: 2, rank: 2 }));
    expect(closeQuestion).not.toHaveBeenCalled();

    activity.commit(activityState({ phase: 'QUESTION_ENDED', currentQuestion: 1 }));

    expect(closeQuestion).toHaveBeenCalledExactlyOnceWith(1);
    expect(notifier.submissionsChanged).toHaveBeenCalledExactlyOnceWith(1);
    expect(submissions.question(1)?.closed).toBe(true);
    expect(submissions.list(1).map((s) => s.judgement)).toEqual(['UNJUDGED', 'UNJUDGED']);
  });

  it('closes the last question when the activity is FINISHED', () => {
    const { activity, closeQuestion, notifier } = setup();
    activity.commit(open(4));
    activity.commit(activityState({ phase: 'FINISHED', currentQuestion: 4 }));
    expect(closeQuestion).toHaveBeenCalledExactlyOnceWith(4);
    expect(notifier.submissionsChanged).toHaveBeenCalledExactlyOnceWith(4);
  });

  it('closes question n, not n + 1, when the next question opens', () => {
    const { activity, closeQuestion, notifier } = setup();
    activity.commit(open(1));
    activity.commit(open(2));
    expect(closeQuestion).toHaveBeenCalledExactlyOnceWith(1);
    expect(notifier.submissionsChanged).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('closes the open question when the activity disappears (cancelled)', () => {
    const { activity, closeQuestion, notifier } = setup();
    activity.commit(open(2));
    activity.commit(null);
    expect(closeQuestion).toHaveBeenCalledExactlyOnceWith(2);
    expect(notifier.submissionsChanged).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('does nothing while the same question stays open (e.g. only member counts changed)', () => {
    const { activity, closeQuestion, notifier } = setup();
    activity.commit(activityState());
    activity.commit(open(1));
    activity.commit(open(1));
    expect(closeQuestion).not.toHaveBeenCalled();
    expect(notifier.submissionsChanged).not.toHaveBeenCalled();
  });

  it('does nothing when no question was open before', () => {
    const { activity, closeQuestion, notifier } = setup();
    activity.commit(activityState());
    activity.commit(activityState({ groupCount: 6 }));
    activity.commit(null);
    expect(closeQuestion).not.toHaveBeenCalled();
    expect(notifier.submissionsChanged).not.toHaveBeenCalled();
  });

  it('closes a question only once when later commits keep it ended', () => {
    const { activity, closeQuestion, notifier } = setup();
    activity.commit(open(1));
    activity.commit(activityState({ phase: 'QUESTION_ENDED', currentQuestion: 1 }));
    activity.commit(activityState({ phase: 'QUESTION_ENDED', currentQuestion: 1 }));
    activity.commit(open(2));
    expect(closeQuestion.mock.calls).toEqual([[1]]);
    expect(notifier.submissionsChanged.mock.calls).toEqual([[1]]);
  });

  it('keeps ACCEPTED and REJECTED and turns only PENDING into UNJUDGED', () => {
    const { activity, submissions } = setup();
    activity.commit(open(1));
    submissions.append(submissionRecord({ groupNumber: 1, rank: 1, judgement: 'REJECTED' }));
    submissions.append(submissionRecord({ groupNumber: 2, rank: 2, judgement: 'ACCEPTED' }));
    submissions.append(submissionRecord({ groupNumber: 3, rank: 3 }));
    activity.commit(activityState({ phase: 'QUESTION_ENDED', currentQuestion: 1 }));
    expect(submissions.list(1).map((s) => s.judgement)).toEqual(['REJECTED', 'ACCEPTED', 'UNJUDGED']);
  });
});
