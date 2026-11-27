import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Submission } from '@quiz-buzzer/shared/entities';
import { SUBMIT, type SubmitReply } from '@quiz-buzzer/shared/submissionEvents';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitWithAck,
  groupQuestionImport,
  startActivityTestServer,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T062: 006 reads 005's single SubmissionStore through app.submissions (contracts/submission-store.md
// 取得方式, diagram-verification D8). Question 1 of the import is a group of 2 sub-questions.
let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer({ importResult: groupQuestionImport() });
});

afterEach(async () => {
  await server.close();
});

function teacher(method: 'GET' | 'POST', url: string, payload?: object) {
  return server.app.inject({ method, url, payload, headers: { authorization: `Bearer ${server.teacherToken}` } });
}

async function submitAs(group: number, requestId: string): Promise<void> {
  const socket: Socket = await server.connectStudent();
  expect((await emitWithAck<GroupAck>(socket, 'group:join', { groupNumber: group })).error).toBeUndefined();
  const reply = await emitWithAck<SubmitReply>(socket, SUBMIT, { questionNumber: 1, answers: [`a${group}`, `b${group}`], requestId });
  expect(reply.ok).toBe(true);
}

describe('app.submissions', () => {
  it('is the store the routes use: list matches GET submissions and winner is the accepted one', async () => {
    await teacher('POST', '/api/activity', { groupCount: 4 });
    expect((await teacher('POST', '/api/activity/questions/1/open')).statusCode).toBe(200);
    await submitAs(2, 'decorator-1');
    await submitAs(3, 'decorator-2');
    expect((await teacher('POST', '/api/questions/1/judgements', { groupNumber: 2, judgement: 'REJECTED' })).statusCode).toBe(200);
    expect((await teacher('POST', '/api/questions/1/judgements', { groupNumber: 3, judgement: 'ACCEPTED' })).statusCode).toBe(200);

    const listed = (await teacher('GET', '/api/questions/1/submissions')).json<Submission[]>();
    expect(server.app.submissions.list(1)).toEqual(listed);
    expect(listed.map((s) => [s.groupNumber, s.rank, s.judgement])).toEqual([
      [2, 1, 'REJECTED'],
      [3, 2, 'ACCEPTED'],
    ]);
    expect(server.app.submissions.winner(1)).toEqual(listed[1]);
  });

  it('answers [] and null for a question without submissions', () => {
    expect(server.app.submissions.list(2)).toEqual([]);
    expect(server.app.submissions.winner(2)).toBeNull();
  });
});
