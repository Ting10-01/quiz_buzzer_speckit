import type { Activity, Judgement } from '@quiz-buzzer/shared/entities';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityManager } from '../../../src/activity/ActivityManager.js';
import type { ActivityState, ActivityStore } from '../../../src/activity/ActivityStore.js';
import { Audience } from '../../../src/activity/ActivityView.js';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { SubmissionEngine } from '../../../src/submission/SubmissionEngine.js';
import type { SubmissionNotifier } from '../../../src/submission/SubmissionNotifier.js';
import { SubmissionStore } from '../../../src/submission/SubmissionStore.js';
import { SubmissionVisibility } from '../../../src/submission/SubmissionVisibility.js';
import { activityState } from '../../helpers/activityState.js';
import { submissionRecord } from '../../helpers/submissionRecord.js';

// T018: SubmissionEngine.judge (data-model section 4, research RD-07, contracts/submission-api.md section 3);
// AC-10–AC-13, AC-15, SC-007. 004's real CommandQueue; a fake ActivityStore whose listeners are called on
// commit, as 004's ActivityStore.commit does; a fake ActivityManager whose endQuestion commits the end.
const LAST = 4; // activityState() has 4 questions

function setup(initial: ActivityState | null = open(1)) {
  let state = initial;
  let version = 0;
  const listeners = new Set<(version: number) => void>();
  const activityStore = {
    current: () => state,
    version: () => version,
    subscribe: (listener: (version: number) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ActivityStore;
  const commit = (next: ActivityState | null) => {
    state = next;
    version += 1;
    for (const listener of [...listeners]) listener(version);
  };

  const queue = new CommandQueue();
  let insideRun = false;
  const endedInsideRun: boolean[] = [];
  const snapshot = vi.fn((audience: Audience) => ({
    version,
    activity: state && ({ phase: state.phase, currentQuestion: state.currentQuestion, audience } as unknown as Activity),
  }));
  const endQuestion = vi.fn((n: number) => {
    endedInsideRun.push(insideRun);
    commit({ ...state!, phase: n === LAST ? 'FINISHED' : 'QUESTION_ENDED' });
    return snapshot(Audience.TEACHER);
  });
  const manager = { endQuestion, snapshot } as unknown as ActivityManager;

  const submissions = new SubmissionStore();
  const notifier = { submissionsChanged: vi.fn(), groupSubmitted: vi.fn(), judged: vi.fn() };
  const engine = new SubmissionEngine(
    submissions,
    new SubmissionVisibility(),
    notifier as unknown as SubmissionNotifier,
    activityStore,
    manager,
    new SequenceClock(),
  );
  // What submissionRoutes does (T011).
  activityStore.subscribe((v) => engine.onActivityChange(v));

  // What SubmissionRoutes does (T022): judge runs inside one CommandQueue.run.
  const judge = (q: number, group: number, judgement: Judgement) =>
    queue.run(() => {
      insideRun = true;
      try {
        return engine.judge(q, group, judgement);
      } finally {
        insideRun = false;
      }
    });

  /** Groups submit question q in this order: ranks 1, 2, 3 … */
  const submitted = (q: number, ...groups: number[]) =>
    groups.forEach((groupNumber, i) => submissions.append(submissionRecord({ questionNumber: q, groupNumber, rank: i + 1 })));

  return { submissions, notifier, endQuestion, endedInsideRun, snapshot, judge, submitted, commit };
}

function open(n: number): ActivityState {
  return activityState({ phase: 'OPEN', currentQuestion: n, openedAt: new Map([[n, 1000]]) });
}

const judgements = (store: SubmissionStore, q = 1) => store.list(q).map((s) => [s.groupNumber, s.judgement]);

describe('SubmissionEngine.judge: only the earliest PENDING can be judged (AC-10)', () => {
  it('ignores a group that is not firstPending and answers the current list and the teacher activity', () => {
    const { submissions, notifier, endQuestion, snapshot, judge, submitted } = setup();
    submitted(1, 2, 4, 1);

    const outcome = judge(1, 4, 'ACCEPTED');

    expect(judgements(submissions)).toEqual([
      [2, 'PENDING'],
      [4, 'PENDING'],
      [1, 'PENDING'],
    ]);
    expect(outcome.submissions).toEqual(submissions.list(1));
    expect(snapshot).toHaveBeenCalledWith(Audience.TEACHER);
    expect(outcome.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 1, audience: Audience.TEACHER });
    expect(endQuestion).not.toHaveBeenCalled();
    expect(notifier.judged).not.toHaveBeenCalled();
  });
});

describe('SubmissionEngine.judge: REJECTED (AC-11)', () => {
  it('marks the record REJECTED, makes the next one firstPending and keeps the question OPEN', () => {
    const { submissions, endQuestion, judge, submitted } = setup();
    submitted(1, 2, 4);

    const outcome = judge(1, 2, 'REJECTED');

    expect(judgements(submissions)).toEqual([
      [2, 'REJECTED'],
      [4, 'PENDING'],
    ]);
    expect(submissions.question(1)?.firstPending()?.groupNumber).toBe(4);
    expect(outcome.submissions).toEqual(submissions.list(1));
    expect(outcome.activity.phase).toBe('OPEN');
    expect(endQuestion).not.toHaveBeenCalled();
  });

  it('notifies judged with the record and the teacher list (AC-15)', () => {
    const { notifier, judge, submitted } = setup();
    submitted(1, 2, 4);
    judge(1, 2, 'REJECTED');
    expect(notifier.judged).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ groupNumber: 2, judgement: 'REJECTED' }));
    expect(notifier.submissionsChanged).toHaveBeenCalledWith(1);
  });
});

describe('SubmissionEngine.judge: ACCEPTED (AC-12, AC-15)', () => {
  it('sets winnerGroup and ends the question once, inside the same CommandQueue.run', () => {
    const { submissions, endQuestion, endedInsideRun, judge, submitted } = setup();
    submitted(1, 2, 4, 1);
    judge(1, 2, 'REJECTED');

    judge(1, 4, 'ACCEPTED');

    expect(submissions.question(1)?.winnerGroup).toBe(4);
    expect(endQuestion).toHaveBeenCalledExactlyOnceWith(1);
    expect(endedInsideRun).toEqual([true]);
  });

  it('turns the other PENDING into UNJUDGED once the store calls the listener, and answers QUESTION_ENDED', () => {
    const { submissions, judge, submitted } = setup();
    submitted(1, 2, 4, 1);

    const outcome = judge(1, 2, 'ACCEPTED');

    expect(judgements(submissions)).toEqual([
      [2, 'ACCEPTED'],
      [4, 'UNJUDGED'],
      [1, 'UNJUDGED'],
    ]);
    expect(submissions.question(1)?.closed).toBe(true);
    expect(outcome.submissions).toEqual(submissions.list(1));
    expect(outcome.activity.phase).toBe('QUESTION_ENDED');
    expect(submissions.winner(1)).toMatchObject({ groupNumber: 2, judgement: 'ACCEPTED', rank: 1 });
  });

  it('answers FINISHED when the last question is accepted', () => {
    const { judge, submitted } = setup(open(LAST));
    submitted(LAST, 3);
    expect(judge(LAST, 3, 'ACCEPTED').activity.phase).toBe('FINISHED');
  });

  it('notifies judged with ACCEPTED only for the accepted group, not for the UNJUDGED ones (AC-15)', () => {
    const { notifier, judge, submitted } = setup();
    submitted(1, 2, 4);
    judge(1, 2, 'ACCEPTED');
    expect(notifier.judged).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ groupNumber: 2, judgement: 'ACCEPTED' }));
    expect(notifier.submissionsChanged).toHaveBeenCalledWith(1);
  });
});

describe('SubmissionEngine.judge: no winner (AC-13)', () => {
  it('has winner null when every submission is rejected', () => {
    const { submissions, judge, submitted } = setup();
    submitted(1, 2, 4);
    judge(1, 2, 'REJECTED');
    judge(1, 4, 'REJECTED');
    expect(submissions.winner(1)).toBeNull();
    expect(submissions.question(1)?.firstPending()).toBeUndefined();
  });

  it('has winner null and changes nothing when nobody submitted', () => {
    const { submissions, endQuestion, judge } = setup();
    const outcome = judge(1, 2, 'ACCEPTED');
    expect(outcome.submissions).toEqual([]);
    expect(outcome.activity.phase).toBe('OPEN');
    expect(submissions.winner(1)).toBeNull();
    expect(endQuestion).not.toHaveBeenCalled();
  });
});

describe('SubmissionEngine.judge: changes nothing when the rules do not allow it (SC-007)', () => {
  it('ignores judging after the question ended', () => {
    const { submissions, notifier, endQuestion, judge, submitted, commit } = setup();
    submitted(1, 2, 4);
    commit(activityState({ phase: 'QUESTION_ENDED', currentQuestion: 1 }));
    notifier.submissionsChanged.mockClear();

    const outcome = judge(1, 2, 'ACCEPTED');

    expect(judgements(submissions)).toEqual([
      [2, 'UNJUDGED'],
      [4, 'UNJUDGED'],
    ]);
    expect(outcome.activity.phase).toBe('QUESTION_ENDED');
    expect(endQuestion).not.toHaveBeenCalled();
    expect(notifier.judged).not.toHaveBeenCalled();
  });

  it('ignores judging once a submission is ACCEPTED', () => {
    const { submissions, endQuestion, judge, submitted } = setup();
    submitted(1, 2, 4);
    submissions.question(1)!.records[0]!.judgement = 'ACCEPTED';
    judge(1, 4, 'REJECTED');
    expect(judgements(submissions)).toEqual([
      [2, 'ACCEPTED'],
      [4, 'PENDING'],
    ]);
    expect(endQuestion).not.toHaveBeenCalled();
  });

  it('ignores a question that is not the open one', () => {
    const { submissions, endQuestion, judge, submitted } = setup(open(2));
    submitted(1, 2);
    submitted(2, 3);
    judge(1, 2, 'ACCEPTED');
    expect(judgements(submissions, 1)).toEqual([[2, 'PENDING']]);
    expect(judgements(submissions, 2)).toEqual([[3, 'PENDING']]);
    expect(endQuestion).not.toHaveBeenCalled();
  });

  it('ignores a group without a record', () => {
    const { submissions, notifier, endQuestion, judge, submitted } = setup();
    submitted(1, 2);
    const outcome = judge(1, 5, 'ACCEPTED');
    expect(judgements(submissions)).toEqual([[2, 'PENDING']]);
    expect(outcome.submissions).toEqual(submissions.list(1));
    expect(endQuestion).not.toHaveBeenCalled();
    expect(notifier.judged).not.toHaveBeenCalled();
  });

  it('ignores judging a record that is already REJECTED', () => {
    const { submissions, judge, submitted } = setup();
    submitted(1, 2, 4);
    judge(1, 2, 'REJECTED');
    judge(1, 2, 'ACCEPTED');
    expect(judgements(submissions)).toEqual([
      [2, 'REJECTED'],
      [4, 'PENDING'],
    ]);
  });
});
