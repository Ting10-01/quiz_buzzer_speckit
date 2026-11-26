import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitWithAck,
  snapshotsOf,
  startActivityTestServer,
  waitForSnapshot,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T036: 1 teacher and 3 students follow every phase within 1 second (AC-17–20, AC-23, REQ-ACT-14–16).
let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

async function command(method: 'POST', url: string, payload?: object): Promise<ActivitySnapshot> {
  const res = await server.app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${server.teacherToken}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as ActivitySnapshot;
}

/** Every socket receives the snapshot of `version`, in the same phase, within 1 second. */
async function expectAllReceive(sockets: Socket[], expected: ActivitySnapshot): Promise<void> {
  const received = await Promise.all(sockets.map((socket) => waitForSnapshot(socket, (s) => s.version === expected.version, 1000)));
  for (const snapshot of received) {
    expect(snapshot.activity?.phase).toBe(expected.activity!.phase);
    expect(snapshot.activity?.currentQuestion).toBe(expected.activity!.currentQuestion);
  }
}

function expectStrictlyIncreasing(socket: Socket): void {
  const versions = snapshotsOf(socket).map((s) => s.version);
  for (let i = 1; i < versions.length; i += 1) expect(versions[i]).toBeGreaterThan(versions[i - 1]!);
}

describe('phase sync across connections', () => {
  it('opens and ends all 4 questions; every connection follows within 1 second (AC-17–20)', async () => {
    const teacher = await server.connectTeacher();
    const students = await Promise.all([1, 2, 3].map(() => server.connectStudent()));
    const everyone = [teacher, ...students];

    await expectAllReceive(everyone, await command('POST', '/api/activity', { groupCount: 4 }));
    for (const [i, student] of students.entries()) {
      const ack = await emitWithAck<GroupAck>(student, 'group:join', { groupNumber: i + 1 });
      expect(ack.error).toBeUndefined();
    }

    for (let n = 1; n <= 4; n += 1) {
      const opened = await command('POST', `/api/activity/questions/${n}/open`);
      expect(opened.activity).toMatchObject({ phase: 'OPEN', currentQuestion: n });
      await expectAllReceive(everyone, opened);

      const ended = await command('POST', `/api/activity/questions/${n}/end`);
      expect(ended.activity).toMatchObject({ phase: n === 4 ? 'FINISHED' : 'QUESTION_ENDED', currentQuestion: n });
      await expectAllReceive(everyone, ended);
    }

    for (const socket of everyone) expectStrictlyIncreasing(socket);
  });

  it('gives a student who was disconnected the current phase right after reconnecting (AC-23)', async () => {
    const teacher = await server.connectTeacher();
    const student = await server.connectStudent();
    await command('POST', '/api/activity', { groupCount: 4 });
    const { studentToken } = await emitWithAck<GroupAck>(student, 'group:join', { groupNumber: 3 });
    await command('POST', '/api/activity/questions/1/open');
    await command('POST', '/api/activity/questions/1/end');

    student.disconnect();
    const opened = await command('POST', '/api/activity/questions/2/open');
    await waitForSnapshot(teacher, (s) => s.version === opened.version, 1000);

    const again = await server.connectStudent(studentToken);
    const first = await waitForSnapshot(again, () => true, 1000);
    expect(first.version).toBe(opened.version);
    expect(first.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
    expect(first.activity?.groups[2]?.memberCount).toBe(1);
  });

  it('keeps students on a blank spreadsheet while the teacher gets the real one (AC-16)', async () => {
    const teacher = await server.connectTeacher();
    const student = await server.connectStudent();
    await command('POST', '/api/activity', { groupCount: 4 });
    const opened = await command('POST', '/api/activity/questions/1/open');
    const forStudent = await waitForSnapshot(student, (s) => s.version === opened.version, 1000);
    const forTeacher = await waitForSnapshot(teacher, (s) => s.version === opened.version, 1000);
    expect(forStudent.activity?.spreadsheet).toMatchObject({ id: '', title: '' });
    expect(forTeacher.activity?.spreadsheet.id).toBe('sheet-id-activity-0001');
  });
});
