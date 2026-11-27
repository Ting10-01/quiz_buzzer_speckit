import type { SubmitReply, SubmitRequest } from '@quiz-buzzer/shared/submissionEvents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityManager } from '../../../src/activity/ActivityManager.js';
import type { ActivityState, ActivityStore } from '../../../src/activity/ActivityStore.js';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { SubmissionEngine } from '../../../src/submission/SubmissionEngine.js';
import type { SubmissionNotifier } from '../../../src/submission/SubmissionNotifier.js';
import { SubmissionStore } from '../../../src/submission/SubmissionStore.js';
import { SubmissionVisibility } from '../../../src/submission/SubmissionVisibility.js';
import { activityState } from '../../helpers/activityState.js';
import { groupQuestionImport } from '../../helpers/activityTestServer.js';

// T012: SubmissionEngine.submit, validate and ownSubmission (data-model section 4, contracts/submission-api.md
// section 1); AC-01–AC-08, AC-23, AC-27, AC-28, REQ-SUB-NFR-03. Uses 004's real CommandQueue and a
// SequenceClock driven by a fake performance.now.
const NOT_JOINED = { field: 'answers', message: '請先加入組別' };
const BAD_FORMAT = { field: 'answers', message: '送出的資料格式不正確' };
const NOT_OPEN = { field: 'answers', message: '這一題目前不能作答' };
const ALREADY = { field: 'answers', message: '本組已送出此題' };
const blank = (i: number) => ({ field: `answers.${i}`, message: '每一格都填才能送出' });
const tooLong = (i: number) => ({ field: `answers.${i}`, message: '每一格最多 200 字' });

// Question 1 is a group of 2 sub-questions; 2–4 are single questions.
const imported = groupQuestionImport();
const OPENED_AT = performance.timeOrigin + 1000;

function openState(n: number, openedAt = OPENED_AT): ActivityState {
  return activityState({
    questions: imported.questions,
    phase: 'OPEN',
    currentQuestion: n,
    openedAt: new Map([[n, openedAt]]),
  });
}

function setup(initial: ActivityState | null = openState(2)) {
  let state = initial;
  const activityStore = { current: () => state, subscribe: () => () => {} } as unknown as ActivityStore;
  const submissions = new SubmissionStore();
  const notifier = {
    submissionsChanged: vi.fn(),
    groupSubmitted: vi.fn(),
    judged: vi.fn(),
  };
  const manager = { endQuestion: vi.fn(), snapshot: vi.fn() } as unknown as ActivityManager;
  const queue = new CommandQueue();
  const engine = new SubmissionEngine(
    submissions,
    new SubmissionVisibility(),
    notifier as unknown as SubmissionNotifier,
    activityStore,
    manager,
    new SequenceClock(),
  );
  const submit = (group: number | null, request: Partial<SubmitRequest> | unknown): SubmitReply =>
    queue.run(() => engine.submit(group, request as SubmitRequest));
  return {
    engine,
    submissions,
    notifier,
    submit,
    processed: () => (engine as unknown as { processed: number }).processed,
    setState: (next: ActivityState | null) => {
      state = next;
    },
  };
}

let requestCount = 0;
function request(overrides: Partial<SubmitRequest> = {}): SubmitRequest {
  requestCount++;
  return { questionNumber: 2, answers: ['光合作用'], requestId: `request-${requestCount}`, ...overrides };
}

function fakeNow(...values: number[]) {
  const spy = vi.spyOn(performance, 'now');
  for (const value of values) spy.mockReturnValueOnce(value);
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SubmissionEngine.submit: accepting', () => {
  it('accepts the first submission with rank 1 and PENDING, and answers the student view with rank 0 (AC-01)', () => {
    const { submit, submissions } = setup();
    const reply = submit(1, request());
    expect(reply).toEqual({
      ok: true,
      submission: expect.objectContaining({ questionNumber: 2, groupNumber: 1, rank: 0, judgement: 'PENDING' }),
    });
    expect(submissions.list(2)).toEqual([expect.objectContaining({ groupNumber: 1, rank: 1, judgement: 'PENDING' })]);
  });

  it('gives ranks 1, 2, 3 in processing order', () => {
    const { submit, submissions } = setup();
    submit(3, request());
    submit(1, request());
    submit(2, request());
    expect(submissions.list(2).map((s) => [s.groupNumber, s.rank])).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('keeps the answers without leading and trailing spaces', () => {
    const { submit, submissions } = setup();
    const reply = submit(1, request({ answers: ['  光合作用 \n'] }));
    expect(reply.submission?.answers).toEqual(['光合作用']);
    expect(submissions.list(2)[0]?.answers).toEqual(['光合作用']);
  });

  it('keeps a group question as one record with one rank and both answers (AC-03)', () => {
    const { submit, submissions } = setup(openState(1));
    const reply = submit(1, request({ questionNumber: 1, answers: ['葉綠體', '二氧化碳'] }));
    expect(reply.ok).toBe(true);
    expect(submissions.list(1)).toEqual([expect.objectContaining({ rank: 1, answers: ['葉綠體', '二氧化碳'] })]);
  });

  it('notifies groupSubmitted once and the teacher list of the question (AC-27)', () => {
    const { submit, notifier } = setup();
    submit(1, request());
    expect(notifier.groupSubmitted).toHaveBeenCalledOnce();
    expect(notifier.groupSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ questionNumber: 2, groupNumber: 1, rank: 1, judgement: 'PENDING' }),
    );
    expect(notifier.submissionsChanged).toHaveBeenCalledWith(2);
  });

  it('sets elapsedMs to SequenceClock.stamp() − openedAt, as an integer (AC-23)', () => {
    const { submit, submissions } = setup();
    fakeNow(2500.6);
    submit(1, request());
    expect(submissions.list(2)[0]?.elapsedMs).toBe(Math.round(performance.timeOrigin + 2500.6 - OPENED_AT));
    expect(Number.isInteger(submissions.list(2)[0]?.elapsedMs)).toBe(true);
  });

  it('never gives a later submission a smaller elapsedMs, even if performance.now goes back (REQ-SUB-NFR-03)', () => {
    const { submit, submissions } = setup();
    fakeNow(5000, 3000, 4000);
    submit(1, request());
    submit(2, request());
    submit(3, request());
    const elapsed = submissions.list(2).map((s) => s.elapsedMs);
    expect(elapsed[1]).toBeGreaterThanOrEqual(elapsed[0]!);
    expect(elapsed[2]).toBeGreaterThanOrEqual(elapsed[1]!);
  });

  it('runs inside 004 CommandQueue.run and adds 1 to processed for every submission, whatever the result', () => {
    const { submit, processed } = setup();
    expect(processed()).toBe(0);
    submit(1, request());
    submit(1, request()); // already submitted
    submit(null, request()); // not joined
    submit(2, request({ answers: [' '] })); // blank
    expect(processed()).toBe(4);
  });
});

describe('SubmissionEngine.submit: rejecting', () => {
  it.each([
    ['an empty cell', [''], 0],
    ['a cell of spaces only', ['  \t '], 0],
  ])('rejects %s with answers.<i> 每一格都填才能送出 (AC-02)', (_name, answers, i) => {
    const { submit, submissions, notifier } = setup();
    expect(submit(1, request({ answers }))).toEqual({ ok: false, error: blank(i) });
    expect(submissions.list(2)).toEqual([]);
    expect(notifier.groupSubmitted).not.toHaveBeenCalled();
  });

  it('reports the first blank cell of a group question (AC-02)', () => {
    const { submit } = setup(openState(1));
    expect(submit(1, request({ questionNumber: 1, answers: ['葉綠體', ' '] }))).toEqual({ ok: false, error: blank(1) });
  });

  it.each([
    ['fewer cells than sub-questions', ['葉綠體']],
    ['more cells than sub-questions', ['葉綠體', '二氧化碳', '水']],
  ])('rejects %s with 送出的資料格式不正確 (AC-03)', (_name, answers) => {
    const { submit, submissions } = setup(openState(1));
    expect(submit(1, request({ questionNumber: 1, answers }))).toEqual({ ok: false, error: BAD_FORMAT });
    expect(submissions.list(1)).toEqual([]);
  });

  it.each([
    ['questionNumber is not a number', { questionNumber: '2' }],
    ['questionNumber is not a positive integer', { questionNumber: 1.5 }],
    ['questionNumber is 0', { questionNumber: 0 }],
    ['answers is not an array', { answers: '光合作用' }],
    ['answers holds a non-string', { answers: [42] }],
    ['requestId is not a string', { requestId: 7 }],
  ])('rejects a payload whose %s with 送出的資料格式不正確', (_name, overrides) => {
    const { submit, submissions } = setup();
    expect(submit(1, { ...request(), ...overrides })).toEqual({ ok: false, error: BAD_FORMAT });
    expect(submissions.list(2)).toEqual([]);
  });

  it('rejects a payload that is not an object with 送出的資料格式不正確', () => {
    const { submit } = setup();
    expect(submit(1, null)).toEqual({ ok: false, error: BAD_FORMAT });
  });

  it('rejects another submission of the same group with a different requestId (AC-04)', () => {
    const { submit, submissions, notifier } = setup();
    submit(1, request({ answers: ['第一次'] }));
    expect(submit(1, request({ answers: ['第二次'] }))).toEqual({ ok: false, error: ALREADY });
    expect(submissions.list(2)).toEqual([expect.objectContaining({ groupNumber: 1, answers: ['第一次'] })]);
    expect(notifier.groupSubmitted).toHaveBeenCalledOnce();
  });

  it('rejects a group whose submission was REJECTED (AC-08)', () => {
    const { submit, submissions } = setup();
    submit(1, request());
    submissions.question(2)!.byGroup(1)!.judgement = 'REJECTED';
    expect(submit(1, request({ answers: ['再試一次'] }))).toEqual({ ok: false, error: ALREADY });
    expect(submissions.list(2)).toHaveLength(1);
  });

  it('rejects a cell over 200 characters with answers.<i> 每一格最多 200 字 (AC-07)', () => {
    const { submit, submissions } = setup(openState(1));
    expect(submit(1, request({ questionNumber: 1, answers: ['葉綠體', '字'.repeat(201)] }))).toEqual({
      ok: false,
      error: tooLong(1),
    });
    expect(submissions.list(1)).toEqual([]);
  });

  it('accepts a cell of exactly 200 characters (AC-07)', () => {
    const { submit } = setup();
    expect(submit(1, request({ answers: ['字'.repeat(200)] })).ok).toBe(true);
  });

  it('counts 200 characters after trimming (AC-07)', () => {
    const { submit } = setup();
    expect(submit(1, request({ answers: [`  ${'字'.repeat(200)}  `] })).ok).toBe(true);
  });

  it('rejects a connection without a group with 請先加入組別', () => {
    const { submit, submissions } = setup();
    expect(submit(null, request())).toEqual({ ok: false, error: NOT_JOINED });
    expect(submissions.list(2)).toEqual([]);
  });
});

describe('SubmissionEngine.submit: the question must be open (AC-06)', () => {
  it.each([
    ['there is no activity', null],
    ['the activity is PREPARING', activityState({ questions: imported.questions })],
    ['the question has ended', activityState({ questions: imported.questions, phase: 'QUESTION_ENDED', currentQuestion: 2 })],
    ['the activity is FINISHED', activityState({ questions: imported.questions, phase: 'FINISHED', currentQuestion: 4 })],
  ])('rejects with 這一題目前不能作答 when %s, without taking a rank', (_name, state) => {
    const { submit, submissions, setState } = setup();
    setState(state);
    expect(submit(1, request())).toEqual({ ok: false, error: NOT_OPEN });
    expect(submissions.list(2)).toEqual([]);

    setState(openState(2));
    submit(1, request());
    expect(submissions.list(2)[0]?.rank).toBe(1);
  });

  it('rejects a question that is not the open one', () => {
    const { submit, submissions } = setup(openState(2));
    expect(submit(1, request({ questionNumber: 3 }))).toEqual({ ok: false, error: NOT_OPEN });
    expect(submit(1, request({ questionNumber: 1, answers: ['a', 'b'] }))).toEqual({ ok: false, error: NOT_OPEN });
    expect(submissions.list(3)).toEqual([]);
    expect(submissions.list(1)).toEqual([]);
  });
});

describe('SubmissionEngine.submit: the same requestId again (AC-05)', () => {
  it('answers the first result again without a new record or another groupSubmitted', () => {
    const { submit, submissions, notifier } = setup();
    const first = request();
    const reply = submit(1, first);
    expect(submit(1, { ...first })).toEqual(reply);
    expect(submissions.list(2)).toHaveLength(1);
    expect(notifier.groupSubmitted).toHaveBeenCalledOnce();
  });

  it('does not take a new rank for the repeat', () => {
    const { submit, submissions } = setup();
    const first = request();
    submit(1, first);
    submit(1, first);
    submit(2, request());
    expect(submissions.list(2).map((s) => s.rank)).toEqual([1, 2]);
  });
});

describe('SubmissionEngine.ownSubmission (AC-28)', () => {
  it('answers this group’s record for the question in the student view (rank 0, current judgement)', () => {
    const { engine, submit, submissions } = setup();
    submit(2, request());
    submit(1, request({ answers: ['本組'] }));
    expect(engine.ownSubmission(1, 2)).toEqual(
      expect.objectContaining({ questionNumber: 2, groupNumber: 1, answers: ['本組'], rank: 0, judgement: 'PENDING' }),
    );

    submissions.question(2)!.byGroup(1)!.judgement = 'REJECTED';
    expect(engine.ownSubmission(1, 2)).toEqual(expect.objectContaining({ rank: 0, judgement: 'REJECTED' }));
  });

  it('answers null when the group has not submitted the question', () => {
    const { engine, submit } = setup();
    submit(2, request());
    expect(engine.ownSubmission(1, 2)).toBeNull();
    expect(engine.ownSubmission(2, 3)).toBeNull();
  });

  it('answers null for a connection without a group', () => {
    const { engine, submit } = setup();
    submit(1, request());
    expect(engine.ownSubmission(null, 2)).toBeNull();
  });
});
