import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listenTestApp, type TestApp } from '../../helpers/testApp.js';
import { loadScenario, midActivityScenario, submission, type ResultScenario } from '../../results/helpers/resultFakes.js';

let t: TestApp & { url: string };
let scenario: ResultScenario;
const sockets: Socket[] = [];

// A connected student socket; `group` is the group 004 puts this connection in.
async function student(group: number | null): Promise<Socket> {
  const socket = connect(t.url, { transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  if (group !== null) t.app.activity.membership.join({ id: socket.id! }, group);
  return socket;
}

beforeEach(async () => {
  scenario = midActivityScenario();
  t = await listenTestApp();
  loadScenario(t.app, scenario);
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await t.app.close();
});

describe('result:question', () => {
  it("acks { ok: true, result } with the connection's own group (AC-02)", async () => {
    const socket = await student(5);
    const ack = await socket.timeout(2000).emitWithAck('result:question', { questionNumber: 2 });
    expect(ack).toEqual({
      ok: true,
      result: {
        questionNumber: 2,
        winner: submission(2, 2, 0, 5000, 'ACCEPTED', ['演算法', '堆疊']),
        submissionCount: 3,
        submissions: [submission(2, 5, 0, 4100, 'REJECTED', ['演算法', '佇列'])],
        behindFirstMs: [0],
      },
    });
  });

  it('ignores a groupNumber in the payload (AC-06)', async () => {
    const socket = await student(null);
    const ack = await socket.timeout(2000).emitWithAck('result:question', { questionNumber: 2, groupNumber: 1 });
    expect(ack.ok).toBe(true);
    expect(ack.result.submissions).toEqual([]);
  });

  it('uses the group of the connection, not the one in the payload', async () => {
    const socket = await student(5);
    const ack = await socket.timeout(2000).emitWithAck('result:question', { questionNumber: 2, groupNumber: 1 });
    expect(ack.result.submissions.map((s: { groupNumber: number }) => s.groupNumber)).toEqual([5]);
  });

  it('acks QUESTION_NOT_ENDED for a question that is still open (AC-05)', async () => {
    const socket = await student(4);
    const ack = await socket.timeout(2000).emitWithAck('result:question', { questionNumber: 3 });
    expect(ack).toEqual({ ok: false, code: 'QUESTION_NOT_ENDED', message: '這一題還沒結束，結果尚未公布' });
  });

  it.each([[{ questionNumber: '2' }], [{}], [null], ['2']])('acks QUESTION_NOT_FOUND for the payload %j', async (payload) => {
    const socket = await student(5);
    const ack = await socket.timeout(2000).emitWithAck('result:question', payload);
    expect(ack).toEqual({ ok: false, code: 'QUESTION_NOT_FOUND', message: '沒有這一題' });
  });

  it('acks NO_ACTIVITY without an activity', async () => {
    t.app.activity.store.commit(null);
    const socket = await student(5);
    const ack = await socket.timeout(2000).emitWithAck('result:question', { questionNumber: 1 });
    expect(ack).toEqual({ ok: false, code: 'NO_ACTIVITY', message: '目前沒有活動' });
  });
});

describe('result:all', () => {
  it('acks { ok: true, results } with only the ended questions', async () => {
    const socket = await student(5);
    const ack = await socket.timeout(2000).emitWithAck('result:all', {});
    expect(ack.ok).toBe(true);
    expect(ack.results.map((r: { questionNumber: number }) => r.questionNumber)).toEqual([1, 2]);
    expect(ack.results[1]).toEqual({
      questionNumber: 2,
      winner: submission(2, 2, 0, 5000, 'ACCEPTED', ['演算法', '堆疊']),
      submissionCount: 3,
      submissions: [submission(2, 5, 0, 4100, 'REJECTED', ['演算法', '佇列'])],
      behindFirstMs: [0],
    });
  });

  it('acks NO_ACTIVITY without an activity', async () => {
    t.app.activity.store.commit(null);
    const socket = await student(5);
    const ack = await socket.timeout(2000).emitWithAck('result:all', {});
    expect(ack).toEqual({ ok: false, code: 'NO_ACTIVITY', message: '目前沒有活動' });
  });
});
