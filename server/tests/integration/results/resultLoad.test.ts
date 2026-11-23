import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { listenTestApp, type TestApp } from '../../helpers/testApp.js';
import { FakeGroupMembership, midActivityScenario } from '../../results/helpers/resultFakes.js';

const CONNECTIONS = 200;

let t: TestApp & { url: string };
let membership: FakeGroupMembership;
const sockets: Socket[] = [];

function open(): Promise<Socket> {
  const socket = connect(t.url, { transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

beforeEach(async () => {
  const scenario = midActivityScenario();
  membership = new FakeGroupMembership();
  t = await listenTestApp({
    activityStore: scenario.activities,
    submissionStore: scenario.submissions,
    groupMembership: membership,
  });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await t.app.close();
});

it(`answers ${CONNECTIONS} connections asking at once within 1 second (SC-005)`, async () => {
  const students = await Promise.all(Array.from({ length: CONNECTIONS }, open));
  students.forEach((socket, i) => membership.assign(socket.id!, (i % 6) + 1));

  const started = performance.now();
  const acks = await Promise.all(
    students.map((socket) => socket.timeout(1000).emitWithAck('result:question', { questionNumber: 2 })),
  );
  const elapsed = performance.now() - started;

  expect(acks.every((ack) => ack.ok === true)).toBe(true);
  expect(elapsed).toBeLessThan(1000);
}, 20_000);
