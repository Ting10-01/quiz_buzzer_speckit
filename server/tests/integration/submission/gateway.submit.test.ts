import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Submission } from '@quiz-buzzer/shared/entities';
import {
  GROUP_SUBMITTED,
  OWN,
  SUBMIT,
  type GroupSubmitted,
  type OwnSubmissionReply,
  type SubmitReply,
} from '@quiz-buzzer/shared/submissionEvents';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitWithAck,
  startActivityTestServer,
  waitForEvent,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T013: submission:submit and submission:own over real Socket.IO connections (contracts/submission-api.md
// sections 1–2); AC-04, AC-19, AC-25, AC-27, AC-28.
const ALREADY = { field: 'answers', message: '本組已送出此題' };
const NOT_OPEN = { field: 'answers', message: '這一題目前不能作答' };

let server: ActivityTestServer;
let requestCount = 0;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

function teacher(method: string, url: string, payload?: object) {
  return server.app.inject({ method: method as 'POST', url, payload, headers: { authorization: `Bearer ${server.teacherToken}` } });
}

async function openQuestion(n = 1, groupCount = 4): Promise<void> {
  if (n === 1) await teacher('POST', '/api/activity', { groupCount });
  const res = await teacher('POST', `/api/activity/questions/${n}/open`);
  expect(res.statusCode).toBe(200);
}

async function student(group?: number): Promise<Socket> {
  const socket = await server.connectStudent();
  if (group !== undefined) {
    const ack = await emitWithAck<GroupAck>(socket, 'group:join', { groupNumber: group });
    expect(ack.error).toBeUndefined();
  }
  return socket;
}

function submit(socket: Socket, payload: object = {}): Promise<SubmitReply> {
  requestCount++;
  return emitWithAck<SubmitReply>(socket, SUBMIT, {
    questionNumber: 1,
    answers: ['光合作用'],
    requestId: `gateway-request-${requestCount}`,
    ...payload,
  });
}

function own(socket: Socket, payload: object = { questionNumber: 1 }): Promise<OwnSubmissionReply> {
  return emitWithAck<OwnSubmissionReply>(socket, OWN, payload);
}

// Collects every event of this name the socket receives from now on.
function record<T>(socket: Socket, event: string): T[] {
  const received: T[] = [];
  socket.on(event, (payload: T) => received.push(payload));
  return received;
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const teacherList = () => server.app.inject({
  method: 'GET',
  url: '/api/questions/1/submissions',
  headers: { authorization: `Bearer ${server.teacherToken}` },
});

describe('submission:submit', () => {
  it('answers a SubmitReply with the student view of the accepted submission', async () => {
    await openQuestion();
    const socket = await student(2);
    const reply = await submit(socket);
    expect(reply).toEqual({
      ok: true,
      submission: { questionNumber: 1, groupNumber: 2, answers: ['光合作用'], rank: 0, elapsedMs: expect.any(Number), judgement: 'PENDING' },
    });
  });

  it('takes the group from the connection and ignores groupNumber in the payload (AC-19)', async () => {
    await openQuestion();
    const socket = await student(2);
    const reply = await submit(socket, { groupNumber: 3 });
    expect(reply.submission?.groupNumber).toBe(2);
    // Group 3 has not submitted, so it can still submit.
    const other = await student(3);
    expect((await submit(other)).ok).toBe(true);
  });

  it('rejects a connection that has not joined a group', async () => {
    await openQuestion();
    const socket = await student();
    expect(await submit(socket, { groupNumber: 1 })).toEqual({ ok: false, error: { field: 'answers', message: '請先加入組別' } });
  });

  it('accepts only one of two tabs of a group submitting at the same time; both tabs get groupSubmitted (AC-04)', async () => {
    await openQuestion();
    const a = await student(1);
    const b = await student(1);
    const noticeA = waitForEvent<GroupSubmitted>(a, GROUP_SUBMITTED);
    const noticeB = waitForEvent<GroupSubmitted>(b, GROUP_SUBMITTED);

    const replies = await Promise.all([submit(a, { answers: ['甲'] }), submit(b, { answers: ['乙'] })]);

    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect(replies.filter((r) => !r.ok)).toEqual([{ ok: false, error: ALREADY }]);
    const accepted = replies.find((r) => r.ok)!.submission!;
    expect((await noticeA).submission).toEqual(accepted);
    expect((await noticeB).submission).toEqual(accepted);
  });

  it('tells the other tab of the group within 1 s, and no tab of another group (AC-27)', async () => {
    await openQuestion();
    const sender = await student(1);
    const teammate = await student(1);
    const otherGroup = await student(2);
    const unjoined = await student();
    const leaked = [...record(otherGroup, GROUP_SUBMITTED), ...record(unjoined, GROUP_SUBMITTED)];
    const teammateGot = record<GroupSubmitted>(teammate, GROUP_SUBMITTED);

    const started = Date.now();
    const notice = waitForEvent<GroupSubmitted>(teammate, GROUP_SUBMITTED, () => true, 1000);
    await submit(sender, { answers: ['光合作用'] });
    const { submission } = await notice;
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    expect(submission).toMatchObject({ groupNumber: 1, answers: ['光合作用'], rank: 0, judgement: 'PENDING' });

    await settle();
    expect(leaked).toEqual([]);
    expect(teammateGot).toHaveLength(1);
  });

  it('sends groupSubmitted only once when the same requestId arrives again', async () => {
    await openQuestion();
    const sender = await student(1);
    const teammate = await student(1);
    const got = record<GroupSubmitted>(teammate, GROUP_SUBMITTED);
    const payload = { requestId: 'same-request-id' };
    const first = await submit(sender, payload);
    expect(await submit(sender, payload)).toEqual(first);
    await settle();
    expect(got).toHaveLength(1);
  });
});

describe('submission:own (AC-28)', () => {
  it('answers this group’s PENDING submission to a tab that joins after a groupmate submitted', async () => {
    await openQuestion();
    const sender = await student(1);
    const { submission } = await submit(sender, { answers: ['光合作用'] });
    const late = await student(1);
    expect(await own(late)).toEqual({ submission });
  });

  // Needs the judging route, which Phase 4 (T022) adds; skipped until then.
  it.skip('answers REJECTED after the teacher rejects the group', async () => {
    await openQuestion();
    const sender = await student(1);
    await submit(sender);
    const judged = await teacher('POST', '/api/questions/1/judgements', { groupNumber: 1, judgement: 'REJECTED' });
    expect(judged.statusCode).toBe(200);
    expect((await own(sender)).submission).toMatchObject({ groupNumber: 1, rank: 0, judgement: 'REJECTED' });
  });

  it('answers null when the group has not submitted, or the tab has not joined', async () => {
    await openQuestion();
    const other = await student(2);
    await submit(await student(1));
    expect(await own(other)).toEqual({ submission: null });
    expect(await own(await student())).toEqual({ submission: null });
  });

  it('answers only this group’s submission even when the payload names another group (AC-19)', async () => {
    await openQuestion();
    await submit(await student(1));
    const other = await student(2);
    expect(await own(other, { questionNumber: 1, groupNumber: 1 })).toEqual({ submission: null });
  });
});

describe('submitting while 004 ends the question (AC-25)', () => {
  it('rejects submissions handled after the end and keeps those handled before it as UNJUDGED, 100 times', async () => {
    const socket = await student();
    let before = 0;
    let after = 0;
    for (let i = 0; i < 100; i++) {
      await teacher('DELETE', '/api/activity');
      await openQuestion(1, 2);
      await emitWithAck<GroupAck>(socket, 'group:join', { groupNumber: 1 });

      // Both commands are in flight together; the CommandQueue decides which is handled first.
      // Half the rounds start the submission first, half start the end first.
      const ending = () => teacher('POST', '/api/activity/questions/1/end');
      let reply: SubmitReply;
      if (i % 2 === 0) [reply] = await Promise.all([submit(socket), ending()]);
      else [, reply] = await Promise.all([ending(), submit(socket)]);

      const list = (await teacherList()).json() as Submission[];
      if (reply.ok) {
        before++;
        expect(list).toEqual([expect.objectContaining({ groupNumber: 1, rank: 1, judgement: 'UNJUDGED' })]);
      } else {
        after++;
        expect(reply).toEqual({ ok: false, error: NOT_OPEN });
        expect(list).toEqual([]);
      }
    }
    expect(before + after).toBe(100);
  }, 30_000);
});
