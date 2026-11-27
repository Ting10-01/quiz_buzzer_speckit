import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { JudgeOutcome, Submission } from '@quiz-buzzer/shared/entities';
import {
  JUDGED,
  SUBMISSIONS_CHANGED,
  SUBMIT,
  type SubmissionJudged,
  type SubmissionsChanged,
  type SubmitReply,
} from '@quiz-buzzer/shared/submissionEvents';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmissionEngine } from '../../../src/submission/SubmissionEngine.js';
import { SubmissionStore } from '../../../src/submission/SubmissionStore.js';
import {
  emitWithAck,
  startActivityTestServer,
  waitForEvent,
  waitForSnapshot,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T019: POST /api/questions/:n/judgements (contracts/submission-api.md section 3) over the real server;
// AC-11, AC-12, AC-15, AC-16, AC-29, SC-001, SC-005. The default import has 4 single questions.
const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: '需要老師登入' };
const INVALID_JUDGEMENT = { code: 'INVALID_JUDGEMENT', message: '判定的資料格式不正確' };
const NO_ACTIVITY = { code: 'NO_ACTIVITY', message: '目前沒有活動' };

let server: ActivityTestServer;
let requestCount = 0;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server.close();
});

function teacher(method: string, url: string, payload?: object, token = server.teacherToken) {
  return server.app.inject({ method: method as 'POST', url, payload, headers: { authorization: `Bearer ${token}` } });
}

const judge = (n: number | string, payload: object, token?: string) =>
  teacher('POST', `/api/questions/${n}/judgements`, payload, token);

const list = async (n = 1, token?: string) => (await teacher('GET', `/api/questions/${n}/submissions`, undefined, token)).json() as Submission[];

/** Creates the activity and opens questions 1 … n (ending each before the next). */
async function openUpTo(n: number, groupCount = 4): Promise<void> {
  expect((await teacher('POST', '/api/activity', { groupCount })).statusCode).toBe(200);
  for (let q = 1; q <= n; q++) {
    if (q > 1) expect((await teacher('POST', `/api/activity/questions/${q - 1}/end`)).statusCode).toBe(200);
    expect((await teacher('POST', `/api/activity/questions/${q}/open`)).statusCode).toBe(200);
  }
}

async function student(group: number): Promise<Socket> {
  const socket = await server.connectStudent();
  expect((await emitWithAck<GroupAck>(socket, 'group:join', { groupNumber: group })).error).toBeUndefined();
  return socket;
}

function send(socket: Socket, questionNumber = 1): Promise<SubmitReply> {
  requestCount++;
  return emitWithAck<SubmitReply>(socket, SUBMIT, { questionNumber, answers: ['光合作用'], requestId: `judge-request-${requestCount}` });
}

/** Each group submits question n, in this order; answers the student sockets by group. */
async function submittedInOrder(n: number, ...groups: number[]): Promise<Map<number, Socket>> {
  const sockets = new Map<number, Socket>();
  for (const group of groups) {
    const socket = await student(group);
    expect((await send(socket, n)).ok).toBe(true);
    sockets.set(group, socket);
  }
  return sockets;
}

const judgements = (submissions: Submission[]) => submissions.map((s) => [s.groupNumber, s.judgement]);

describe('POST /api/questions/:n/judgements: outcome', () => {
  it('answers JudgeOutcome: REJECTED keeps the question OPEN and the next submission becomes judgeable (AC-11)', async () => {
    await openUpTo(1);
    await submittedInOrder(1, 2, 4);

    const res = await judge(1, { groupNumber: 2, judgement: 'REJECTED' });

    expect(res.statusCode).toBe(200);
    const outcome = res.json() as JudgeOutcome;
    expect(judgements(outcome.submissions)).toEqual([
      [2, 'REJECTED'],
      [4, 'PENDING'],
    ]);
    expect(outcome.submissions.map((s) => s.rank)).toEqual([1, 2]);
    expect(outcome.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 1 });
  });

  it('answers the unchanged outcome when the group is not the earliest PENDING (AC-10)', async () => {
    await openUpTo(1);
    await submittedInOrder(1, 2, 4);

    const res = await judge(1, { groupNumber: 4, judgement: 'ACCEPTED' });

    expect(res.statusCode).toBe(200);
    expect(judgements((res.json() as JudgeOutcome).submissions)).toEqual([
      [2, 'PENDING'],
      [4, 'PENDING'],
    ]);
    expect((res.json() as JudgeOutcome).activity.phase).toBe('OPEN');
  });

  it('ACCEPTED answers QUESTION_ENDED with the other PENDING UNJUDGED, and every student gets the phase within 1 s (AC-12, SC-005)', async () => {
    await openUpTo(1);
    const sockets = await submittedInOrder(1, 2, 4);
    const watcher = await student(3);
    const students = [...sockets.values(), watcher];
    const ended = students.map((socket) => waitForSnapshot(socket, (s) => s.activity?.phase === 'QUESTION_ENDED', 1000));

    const res = await judge(1, { groupNumber: 2, judgement: 'ACCEPTED' });

    expect(res.statusCode).toBe(200);
    const outcome = res.json() as JudgeOutcome;
    expect(outcome.activity).toMatchObject({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
    expect(judgements(outcome.submissions)).toEqual([
      [2, 'ACCEPTED'],
      [4, 'UNJUDGED'],
    ]);
    const snapshots: ActivitySnapshot[] = await Promise.all(ended);
    expect(snapshots.every((s) => s.activity?.currentQuestion === 1)).toBe(true);
  });

  it('ACCEPTED on the last question answers FINISHED (AC-12)', async () => {
    await openUpTo(4);
    await submittedInOrder(4, 1);
    const res = await judge(4, { groupNumber: 1, judgement: 'ACCEPTED' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as JudgeOutcome).activity.phase).toBe('FINISHED');
  });

  it('changes nothing after the question was accepted', async () => {
    await openUpTo(1);
    await submittedInOrder(1, 2, 4);
    await judge(1, { groupNumber: 2, judgement: 'ACCEPTED' });

    const res = await judge(1, { groupNumber: 4, judgement: 'ACCEPTED' });
    expect(res.statusCode).toBe(200);
    expect(judgements((res.json() as JudgeOutcome).submissions)).toEqual([
      [2, 'ACCEPTED'],
      [4, 'UNJUDGED'],
    ]);
  });
});

describe('POST /api/questions/:n/judgements: errors', () => {
  it.each([
    ['no body', undefined],
    ['groupNumber 0', { groupNumber: 0, judgement: 'ACCEPTED' }],
    ['groupNumber 1.5', { groupNumber: 1.5, judgement: 'ACCEPTED' }],
    ['groupNumber as a string', { groupNumber: '1', judgement: 'ACCEPTED' }],
    ['judgement PENDING', { groupNumber: 1, judgement: 'PENDING' }],
    ['judgement UNJUDGED', { groupNumber: 1, judgement: 'UNJUDGED' }],
    ['no judgement', { groupNumber: 1 }],
  ])('answers 400 INVALID_JUDGEMENT for %s', async (_, payload) => {
    await openUpTo(1);
    const res = await judge(1, payload as object);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(INVALID_JUDGEMENT);
  });

  // contracts/submission-api.md section 3: a bad :n is also INVALID_JUDGEMENT (2026-11-27 使用者決定：依 contract).
  it.each(['abc', '0', '-1', '1.5'])('answers 400 INVALID_JUDGEMENT when :n is %s', async (n) => {
    await openUpTo(1);
    const res = await judge(n, { groupNumber: 1, judgement: 'ACCEPTED' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(INVALID_JUDGEMENT);
  });

  it('answers 409 NO_ACTIVITY without an activity', async () => {
    const res = await judge(1, { groupNumber: 1, judgement: 'ACCEPTED' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(NO_ACTIVITY);
  });

  it('is rejected by requireTeacher without a teacher credential, and nothing changes (AC-16)', async () => {
    await openUpTo(1);
    await submittedInOrder(1, 2);
    const res = await server.app.inject({ method: 'POST', url: '/api/questions/1/judgements', payload: { groupNumber: 2, judgement: 'ACCEPTED' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(judgements(await list())).toEqual([[2, 'PENDING']]);
  });

  it('is rejected by requireTeacher with a wrong teacher credential (AC-16)', async () => {
    await openUpTo(1);
    await submittedInOrder(1, 2);
    const res = await judge(1, { groupNumber: 2, judgement: 'ACCEPTED' }, 'not-a-teacher-token');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(judgements(await list())).toEqual([[2, 'PENDING']]);
  });
});

describe('the teacher signs in again (AC-29)', () => {
  it('refuses the old credential, gives the new one the full list, its pushes and judging', async () => {
    await openUpTo(1);
    await submittedInOrder(1, 1, 2);
    await judge(1, { groupNumber: 1, judgement: 'REJECTED' });
    const old = server.teacherToken;

    await server.rotateTeacher();

    // The old credential's judgement is refused and changes nothing.
    const refused = await judge(1, { groupNumber: 2, judgement: 'ACCEPTED' }, old);
    expect(refused.statusCode).toBe(401);
    expect(refused.json()).toEqual(UNAUTHORIZED);

    // The new credential reads the full list with the current judgements.
    expect(judgements(await list())).toEqual([
      [1, 'REJECTED'],
      [2, 'PENDING'],
    ]);

    // The new teacher connection gets later submissions:changed.
    const teacherSocket = await server.connectTeacher();
    const changed = waitForEvent<SubmissionsChanged>(teacherSocket, SUBMISSIONS_CHANGED, (p) => p.submissions.length === 3, 1000);
    await submittedInOrder(1, 3);
    expect(judgements((await changed).submissions)).toEqual([
      [1, 'REJECTED'],
      [2, 'PENDING'],
      [3, 'PENDING'],
    ]);

    // And keeps judging.
    const accepted = await judge(1, { groupNumber: 2, judgement: 'ACCEPTED' });
    expect(accepted.statusCode).toBe(200);
    expect(judgements((accepted.json() as JudgeOutcome).submissions)).toEqual([
      [1, 'REJECTED'],
      [2, 'ACCEPTED'],
      [3, 'UNJUDGED'],
    ]);
  });
});

describe('submission:judged (AC-11, AC-15)', () => {
  it('reaches every connection of the rejected group with REJECTED and rank 0, and no group ranked after it', async () => {
    await openUpTo(1);
    const sockets = await submittedInOrder(1, 2, 4);
    const groupmate = await student(2);
    const later = sockets.get(4)!;
    const leaked: unknown[] = [];
    later.on(JUDGED, (payload: unknown) => leaked.push(payload));

    const received = [sockets.get(2)!, groupmate].map((socket) =>
      waitForEvent<SubmissionJudged>(socket, JUDGED, () => true, 1000),
    );
    expect((await judge(1, { groupNumber: 2, judgement: 'REJECTED' })).statusCode).toBe(200);

    for (const payload of await Promise.all(received)) {
      expect(payload.submission).toMatchObject({ questionNumber: 1, groupNumber: 2, rank: 0, judgement: 'REJECTED' });
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toEqual([]);
  });

  it('is not sent to the groups that become UNJUDGED when another group is accepted', async () => {
    await openUpTo(1);
    const sockets = await submittedInOrder(1, 2, 4);
    const leaked: unknown[] = [];
    sockets.get(4)!.on(JUDGED, (payload: unknown) => leaked.push(payload));
    const accepted = waitForEvent<SubmissionJudged>(sockets.get(2)!, JUDGED, () => true, 1000);

    await judge(1, { groupNumber: 2, judgement: 'ACCEPTED' });

    expect((await accepted).submission).toMatchObject({ groupNumber: 2, rank: 0, judgement: 'ACCEPTED' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toEqual([]);
  });
});

describe('two groups submitting almost together (SC-001)', () => {
  it('gives distinct ranks, #1 to the one handled first, and the teacher list equals SubmissionStore.list, 100 times', async () => {
    for (let i = 0; i < 100; i++) {
      // 004 cannot cancel an activity once question 1 opened, so every round gets its own server.
      if (i > 0) {
        vi.restoreAllMocks();
        await server.close();
        server = await startActivityTestServer();
      }
      const handled = vi.spyOn(SubmissionEngine.prototype, 'submit');
      const appended = vi.spyOn(SubmissionStore.prototype, 'append');
      await openUpTo(1, 2);
      const [a, b] = [await student(1), await student(2)];
      const teacherSocket = await server.connectTeacher();
      const changed = waitForEvent<SubmissionsChanged>(teacherSocket, SUBMISSIONS_CHANGED, (p) => p.submissions.length === 2);

      const replies = await Promise.all([send(a), send(b)]);
      expect(replies.every((reply) => reply.ok)).toBe(true);

      const teacherList = await list();
      expect(teacherList.map((s) => s.rank)).toEqual([1, 2]);
      const firstHandled = handled.mock.calls[0]![0];
      expect(teacherList[0]!.groupNumber).toBe(firstHandled);
      const store = appended.mock.contexts[0] as SubmissionStore;
      expect(teacherList).toEqual(store.list(1));
      expect((await changed).submissions).toEqual(store.list(1));
    }
  }, 120_000);
});
