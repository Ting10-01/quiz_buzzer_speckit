import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import {
  GROUP_SUBMITTED,
  JUDGED,
  OWN,
  SUBMISSIONS_CHANGED,
  SUBMIT,
  type GroupSubmitted,
  type OwnSubmissionReply,
  type SubmissionJudged,
  type SubmissionsChanged,
  type SubmitReply,
} from '@quiz-buzzer/shared/submissionEvents';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitWithAck,
  startActivityTestServer,
  waitForEvent,
  waitForSnapshot,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T025: what a student connection can learn about other groups (REQ-SUB-16, REQ-SUB-17); AC-16, AC-17,
// AC-18, AC-19, SC-004. Groups 1 and 2 submit question 1 in that order, so group 2's real rank is 2;
// group 4 never submits. The default import has 4 single questions.
const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: '需要老師登入' };
const GROUP_1_ANSWER = '第一組的答案葉綠體';
const GROUP_2_ANSWER = '第二組的答案光合作用';

let server: ActivityTestServer;
let requestCount = 0;

/** Every event and ack a student connection has received, in arrival order. */
const received = new Map<Socket, { event: string; payload: unknown }[]>();

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  received.clear();
  await server.close();
});

function teacher(method: string, url: string, payload?: object) {
  return server.app.inject({ method: method as 'POST', url, payload, headers: { authorization: `Bearer ${server.teacherToken}` } });
}

async function openFirstQuestion(): Promise<void> {
  expect((await teacher('POST', '/api/activity', { groupCount: 4 })).statusCode).toBe(200);
  expect((await teacher('POST', '/api/activity/questions/1/open')).statusCode).toBe(200);
}

/** A recorded student connection in `group`; also returns its studentToken. */
async function student(group: number): Promise<{ socket: Socket; studentToken: string }> {
  const socket = await server.connectStudent();
  const log: { event: string; payload: unknown }[] = [];
  received.set(socket, log);
  socket.onAny((event: string, payload: unknown) => log.push({ event, payload }));
  const ack = await emitWithAck<GroupAck>(socket, 'group:join', { groupNumber: group });
  log.push({ event: 'ack:group:join', payload: ack });
  expect(ack.error).toBeUndefined();
  return { socket, studentToken: ack.studentToken as string };
}

async function submit(socket: Socket, answer: string): Promise<SubmitReply> {
  requestCount++;
  const reply = await emitWithAck<SubmitReply>(socket, SUBMIT, { questionNumber: 1, answers: [answer], requestId: `isolation-request-${requestCount}` });
  received.get(socket)?.push({ event: `ack:${SUBMIT}`, payload: reply });
  expect(reply.ok).toBe(true);
  return reply;
}

async function own(socket: Socket, payload: object = { questionNumber: 1 }): Promise<OwnSubmissionReply> {
  const reply = await emitWithAck<OwnSubmissionReply>(socket, OWN, payload);
  received.get(socket)?.push({ event: `ack:${OWN}`, payload: reply });
  return reply;
}

const serialized = (socket: Socket) => JSON.stringify(received.get(socket));
const eventsOf = (socket: Socket) => (received.get(socket) ?? []).map((entry) => entry.event);

/** Waits for the teacher list of question 1 that has `count` rows, so every push of that change was sent. */
const teacherListWith = (teacherSocket: Socket, count: number) =>
  waitForEvent<SubmissionsChanged>(teacherSocket, SUBMISSIONS_CHANGED, (p) => p.submissions.length === count);

function expectNothingOfGroups1And2(socket: Socket): void {
  const text = serialized(socket);
  expect(text).not.toContain(GROUP_1_ANSWER);
  expect(text).not.toContain(GROUP_2_ANSWER);
  expect(text).not.toContain('"groupNumber":1');
  expect(text).not.toContain('"groupNumber":2');
  expect(text).not.toContain('"rank"');
  expect(text).not.toContain('"elapsedMs"');
}

describe('a student connection of another group (AC-17, SC-004)', () => {
  it('receives nothing of groups 1 and 2 before and after the teacher judges them', async () => {
    await openFirstQuestion();
    const teacherSocket = await server.connectTeacher();
    const group4 = await student(4);
    const group1 = await student(1);
    const group2 = await student(2);

    const listed = teacherListWith(teacherSocket, 2);
    await submit(group1.socket, GROUP_1_ANSWER);
    await submit(group2.socket, GROUP_2_ANSWER);
    await listed;
    expect((await own(group4.socket)).submission).toBeNull();
    expectNothingOfGroups1And2(group4.socket);

    const rejected = waitForEvent<SubmissionJudged>(group1.socket, JUDGED);
    expect((await teacher('POST', '/api/questions/1/judgements', { groupNumber: 1, judgement: 'REJECTED' })).statusCode).toBe(200);
    await rejected;
    const ended = waitForSnapshot(group4.socket, (s) => s.activity?.phase === 'QUESTION_ENDED');
    const accepted = waitForEvent<SubmissionJudged>(group2.socket, JUDGED);
    expect((await teacher('POST', '/api/questions/1/judgements', { groupNumber: 2, judgement: 'ACCEPTED' })).statusCode).toBe(200);
    await Promise.all([ended, accepted]);
    expect((await own(group4.socket)).submission).toBeNull();

    expectNothingOfGroups1And2(group4.socket);
    expect(eventsOf(group4.socket)).not.toContain(GROUP_SUBMITTED);
    expect(eventsOf(group4.socket)).not.toContain(JUDGED);
  });

  it('gets only its own submission when submission:own names another group (AC-19)', async () => {
    await openFirstQuestion();
    const group2 = await student(2);
    const group4 = await student(4);
    await submit(group2.socket, GROUP_2_ANSWER);

    expect((await own(group4.socket, { questionNumber: 1, groupNumber: 2 })).submission).toBeNull();
    expect(serialized(group4.socket)).not.toContain(GROUP_2_ANSWER);
  });
});

describe('the submitting group (AC-18)', () => {
  it('gets rank 0 in the submit ack, submission:own, submission:groupSubmitted and submission:judged', async () => {
    await openFirstQuestion();
    const teacherSocket = await server.connectTeacher();
    const group1 = await student(1);
    const group2 = await student(2);
    const group2OtherTab = await student(2);

    const listed = teacherListWith(teacherSocket, 2);
    await submit(group1.socket, GROUP_1_ANSWER);
    const groupSubmitted = waitForEvent<GroupSubmitted>(group2OtherTab.socket, GROUP_SUBMITTED);
    const reply = await submit(group2.socket, GROUP_2_ANSWER);
    const pushed = await groupSubmitted;
    const teacherList = (await listed).submissions;
    const ownReply = await own(group2OtherTab.socket);

    expect(teacherList.find((s) => s.groupNumber === 2)?.rank).toBe(2);
    expect(reply.submission).toMatchObject({ groupNumber: 2, answers: [GROUP_2_ANSWER], judgement: 'PENDING', rank: 0 });
    expect(pushed.submission).toMatchObject({ groupNumber: 2, answers: [GROUP_2_ANSWER], judgement: 'PENDING', rank: 0 });
    expect(ownReply.submission).toMatchObject({ groupNumber: 2, answers: [GROUP_2_ANSWER], judgement: 'PENDING', rank: 0 });

    await teacher('POST', '/api/questions/1/judgements', { groupNumber: 1, judgement: 'REJECTED' });
    const judged = waitForEvent<SubmissionJudged>(group2OtherTab.socket, JUDGED);
    expect((await teacher('POST', '/api/questions/1/judgements', { groupNumber: 2, judgement: 'ACCEPTED' })).statusCode).toBe(200);
    expect((await judged).submission).toMatchObject({ groupNumber: 2, judgement: 'ACCEPTED', rank: 0 });

    for (const tab of [group2.socket, group2OtherTab.socket]) {
      const text = serialized(tab);
      expect(text).not.toContain(GROUP_1_ANSWER);
      expect(text).not.toContain('"groupNumber":1');
      expect(text).not.toMatch(/"rank":[1-9]/);
    }
  });
});

describe('teacher-only routes and pushes from a student connection (AC-16, AC-19)', () => {
  it('rejects both HTTP routes with no credential or a student credential, and never pushes submissions:changed to students', async () => {
    await openFirstQuestion();
    const teacherSocket = await server.connectTeacher();
    const group1 = await student(1);
    const group2 = await student(2);
    const listed = teacherListWith(teacherSocket, 2);
    await submit(group1.socket, GROUP_1_ANSWER);
    await submit(group2.socket, GROUP_2_ANSWER);
    await listed;

    const asStudent = [{}, { authorization: `Bearer ${group2.studentToken}` }];
    for (const headers of asStudent) {
      const listRes = await server.app.inject({ method: 'GET', url: '/api/questions/1/submissions', headers });
      expect(listRes.statusCode).toBe(401);
      expect(listRes.json()).toEqual(UNAUTHORIZED);
      const judgeRes = await server.app.inject({
        method: 'POST',
        url: '/api/questions/1/judgements',
        headers,
        payload: { groupNumber: 2, judgement: 'ACCEPTED' },
      });
      expect(judgeRes.statusCode).toBe(401);
      expect(judgeRes.json()).toEqual(UNAUTHORIZED);
    }

    const teacherView = (await teacher('GET', '/api/questions/1/submissions')).json() as { judgement: string }[];
    expect(teacherView.map((s) => s.judgement)).toEqual(['PENDING', 'PENDING']);
    for (const socket of [group1.socket, group2.socket]) expect(eventsOf(socket)).not.toContain(SUBMISSIONS_CHANGED);
  });
});
