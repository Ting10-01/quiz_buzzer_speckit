import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEACHER_ROOM } from '../../../src/realtime/socketServer.js';
import {
  emitWithAck,
  snapshotsOf,
  startActivityTestServer,
  waitForSnapshot,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T048: the activity keeps going when the teacher tab reloads or is replaced by another sign-in
// (AC-25, AC-32, REQ-ACT-21; 002 voids the old credential and drops its sockets).
let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

async function command(url: string, payload?: object): Promise<ActivitySnapshot> {
  const res = await server.app.inject({
    method: 'POST',
    url,
    payload,
    headers: { authorization: `Bearer ${server.teacherToken}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as ActivitySnapshot;
}

/** PREPARING with 4 groups, two students in groups 1 and 2, then OPEN(2). */
async function openQuestion2(): Promise<Socket[]> {
  await command('/api/activity', { groupCount: 4 });
  const students = await Promise.all([1, 2].map(() => server.connectStudent()));
  for (const [i, student] of students.entries()) {
    const ack = await emitWithAck<GroupAck>(student, 'group:join', { groupNumber: i + 1 });
    expect(ack.error).toBeUndefined();
  }
  await command('/api/activity/questions/1/open');
  await command('/api/activity/questions/1/end');
  const open2 = await command('/api/activity/questions/2/open');
  expect(open2.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
  for (const student of students) await waitForSnapshot(student, (s) => s.version === open2.version);
  return students;
}

function disconnectReason(socket: Socket): Promise<string> {
  return new Promise((resolve) => socket.once('disconnect', (reason) => resolve(reason)));
}

/**
 * Resolves once the server has no teacher connection left. Socket.IO leaves the rooms and runs the
 * server's 'disconnect' handlers in the same step, so those handlers have run by then.
 */
async function teacherRoomEmpty(timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while ((await server.app.io.in(TEACHER_ROOM).fetchSockets()).length > 0) {
    if (Date.now() > deadline) throw new Error(`the teacher connection was still there after ${timeoutMs} ms`);
    await pause(10);
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('teacher refresh during an activity', () => {
  it('keeps OPEN(2) and its version when the teacher connection goes away (AC-25)', async () => {
    const teacher = await server.connectTeacher();
    const students = await openQuestion2();
    const before = server.app.activity.store.version();

    teacher.disconnect();
    await pause(100);

    expect(server.app.activity.store.version()).toBe(before);
    expect(server.app.activity.store.current()).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
    for (const student of students) expect(student.connected).toBe(true);
  });

  it('still pushes later phase changes to every student after the teacher left (AC-25)', async () => {
    const teacher = await server.connectTeacher();
    const students = await openQuestion2();
    teacher.disconnect();
    // The server has handled the teacher leaving before the next command goes out.
    await teacherRoomEmpty();

    const ended = await command('/api/activity/questions/2/end');
    for (const student of students) {
      const snapshot = await waitForSnapshot(student, (s) => s.version === ended.version, 1000);
      expect(snapshot.activity).toMatchObject({ phase: 'QUESTION_ENDED', currentQuestion: 2 });
    }
  });
});

describe('another sign-in replaces the teacher during an activity (AC-32)', () => {
  it('drops the old teacher connection and leaves the activity and students alone', async () => {
    const oldTeacher = await server.connectTeacher();
    const students = await openQuestion2();
    const before = server.app.activity.store.version();
    const studentSnapshots = students.map((student) => snapshotsOf(student).length);
    const dropped = disconnectReason(oldTeacher);

    await server.rotateTeacher();

    await expect(dropped).resolves.toBe('io server disconnect');
    await pause(100);
    expect(server.app.activity.store.version()).toBe(before);
    expect(server.app.activity.store.current()).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
    for (const [i, student] of students.entries()) {
      expect(student.connected).toBe(true);
      expect(snapshotsOf(student)).toHaveLength(studentSnapshots[i]!);
    }
  });

  it('refuses the old credential with UNAUTHORIZED when the old tab reconnects', async () => {
    await openQuestion2();
    const voided = server.teacherToken;
    await server.rotateTeacher();

    await expect(server.connectTeacher(voided)).rejects.toThrow('UNAUTHORIZED');
    const members = await server.app.io.in(TEACHER_ROOM).fetchSockets();
    expect(members).toHaveLength(0);
  });

  it('gives a connection with the new credential the teacher room and the TEACHER snapshot of OPEN(2)', async () => {
    await openQuestion2();
    const version = server.app.activity.store.version();
    await server.rotateTeacher();

    const teacher = await server.connectTeacher();
    const snapshot = await waitForSnapshot(teacher, undefined, 1000);

    const members = (await server.app.io.in(TEACHER_ROOM).fetchSockets()).map((socket) => socket.id);
    expect(members).toEqual([teacher.id]);
    expect(snapshot.version).toBe(version);
    expect(snapshot.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
    expect(snapshot.activity?.spreadsheet.id).not.toBe('');
  });
});
