import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import {
  SUBMISSIONS_CHANGED,
  SUBMIT,
  type SubmissionsChanged,
  type SubmitReply,
} from '@quiz-buzzer/shared/submissionEvents';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitWithAck,
  groupQuestionImport,
  startActivityTestServer,
  waitForEvent,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T037: GET /api/questions/:n/submissions and the teacher's submissions:changed (contracts/submission-api.md
// sections 2–3); AC-03, AC-09, AC-16. Question 1 of the import is a group of 2 sub-questions.
const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: '需要老師登入' };

let server: ActivityTestServer;
let requestCount = 0;

beforeEach(async () => {
  server = await startActivityTestServer({ importResult: groupQuestionImport() });
});

afterEach(async () => {
  await server.close();
});

function teacher(method: string, url: string, payload?: object) {
  return server.app.inject({ method: method as 'POST', url, payload, headers: { authorization: `Bearer ${server.teacherToken}` } });
}

const list = (n: number | string, headers: Record<string, string> = { authorization: `Bearer ${server.teacherToken}` }) =>
  server.app.inject({ method: 'GET', url: `/api/questions/${n}/submissions`, headers });

async function openFirstQuestion(): Promise<void> {
  await teacher('POST', '/api/activity', { groupCount: 4 });
  expect((await teacher('POST', '/api/activity/questions/1/open')).statusCode).toBe(200);
}

async function student(group: number): Promise<Socket> {
  const socket = await server.connectStudent();
  expect((await emitWithAck<GroupAck>(socket, 'group:join', { groupNumber: group })).error).toBeUndefined();
  return socket;
}

async function submit(socket: Socket, answers: string[]): Promise<SubmitReply> {
  requestCount++;
  const reply = await emitWithAck<SubmitReply>(socket, SUBMIT, { questionNumber: 1, answers, requestId: `list-request-${requestCount}` });
  expect(reply.ok).toBe(true);
  return reply;
}

describe('GET /api/questions/:n/submissions', () => {
  it('answers the teacher view ordered by rank, one row per group with both answers of the group question (AC-03)', async () => {
    await openFirstQuestion();
    await submit(await student(3), ['葉綠體', '二氧化碳']);
    await submit(await student(1), ['粒線體', '氧氣']);

    const res = await list(1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { questionNumber: 1, groupNumber: 3, answers: ['葉綠體', '二氧化碳'], rank: 1, elapsedMs: expect.any(Number), judgement: 'PENDING' },
      { questionNumber: 1, groupNumber: 1, answers: ['粒線體', '氧氣'], rank: 2, elapsedMs: expect.any(Number), judgement: 'PENDING' },
    ]);
  });

  it('answers [] for a question without submissions or not opened yet', async () => {
    await openFirstQuestion();
    expect((await list(1)).json()).toEqual([]);
    expect((await list(4)).json()).toEqual([]);
  });

  it.each(['abc', '0', '-1', '1.5'])('answers 400 INVALID_QUESTION_NUMBER when :n is %s', async (n) => {
    const res = await list(n);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'INVALID_QUESTION_NUMBER', message: '題號格式不正確' });
  });

  it('is rejected by requireTeacher without a teacher credential (AC-16)', async () => {
    await openFirstQuestion();
    await submit(await student(1), ['葉綠體', '二氧化碳']);
    const res = await list(1, {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
  });

  it('is rejected by requireTeacher with a voided teacher credential (AC-16)', async () => {
    const old = server.teacherToken;
    await server.rotateTeacher();
    const res = await list(1, { authorization: `Bearer ${old}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
  });
});

describe('submissions:changed', () => {
  it('reaches the teacher connection within 1 s of a student submitting, with the full list (AC-09)', async () => {
    await openFirstQuestion();
    const teacherSocket = await server.connectTeacher();
    const sender = await student(2);
    const changed = waitForEvent<SubmissionsChanged>(teacherSocket, SUBMISSIONS_CHANGED, (p) => p.submissions.length === 1, 1000);

    const started = Date.now();
    await submit(sender, ['葉綠體', '二氧化碳']);
    const payload = await changed;
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    expect(payload).toEqual({
      questionNumber: 1,
      submissions: [expect.objectContaining({ groupNumber: 2, rank: 1, answers: ['葉綠體', '二氧化碳'], judgement: 'PENDING' })],
    });
  });

  it('never reaches a student connection', async () => {
    await openFirstQuestion();
    const teacherSocket = await server.connectTeacher();
    const watcher = await student(1);
    const leaked: unknown[] = [];
    watcher.on(SUBMISSIONS_CHANGED, (payload: unknown) => leaked.push(payload));
    const changed = waitForEvent(teacherSocket, SUBMISSIONS_CHANGED);

    await submit(await student(2), ['葉綠體', '二氧化碳']);
    await changed;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toEqual([]);
  });
});
