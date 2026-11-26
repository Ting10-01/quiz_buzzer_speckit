import { io as connect } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEACHER_ROOM } from '../../../src/realtime/socketServer.js';
import {
  snapshotsOf,
  startActivityTestServer,
  waitForSnapshot,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// contracts/socket-events.md "連線"; REQ-ACT-15 (current state on connect), REQ-ACT-20 (WebSocket only),
// research RA-04 (one push per event loop turn), RA-07 (teacher and student rooms).
const STUDENTS_ROOM = 'students';

let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

async function roomMembers(room: string): Promise<string[]> {
  return (await server.app.io.in(room).fetchSockets()).map((socket) => socket.id);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('activity connection', () => {
  it('sends { version: 0, activity: null } right after a student connects (REQ-ACT-15)', async () => {
    const student = await server.connectStudent();
    await expect(waitForSnapshot(student, undefined, 1000)).resolves.toEqual({ version: 0, activity: null });
  });

  it('sends the current snapshot right after a teacher connects (REQ-ACT-15)', async () => {
    const teacher = await server.connectTeacher();
    await expect(waitForSnapshot(teacher, undefined, 1000)).resolves.toEqual({ version: 0, activity: null });
  });

  it('refuses a client that only uses long polling (AC-31, REQ-ACT-20)', async () => {
    const socket = connect(server.url, { transports: ['polling'], reconnection: false, forceNew: true });
    try {
      await expect(
        new Promise((resolve, reject) => {
          socket.once('connect', () => reject(new Error('polling client was accepted')));
          socket.once('connect_error', resolve);
        }),
      ).resolves.toBeInstanceOf(Error);
    } finally {
      socket.disconnect();
    }
  });

  it('puts a teacher connection in the teacher room and a connection without a credential in the students room', async () => {
    const teacher = await server.connectTeacher();
    const student = await server.connectStudent();
    await waitForSnapshot(student);
    const teachers = await roomMembers(TEACHER_ROOM);
    const students = await roomMembers(STUDENTS_ROOM);
    expect(teachers).toEqual([teacher.id]);
    expect(students).toEqual([student.id]);
  });

  it('refuses a voided teacher credential with UNAUTHORIZED', async () => {
    const voided = server.teacherToken;
    await server.rotateTeacher();
    await expect(server.connectTeacher(voided)).rejects.toThrow('UNAUTHORIZED');
  });

  it('pushes only the newest snapshot when two commits happen in the same event loop turn (RA-04)', async () => {
    const student = await server.connectStudent();
    const teacher = await server.connectTeacher();
    await waitForSnapshot(student);
    await waitForSnapshot(teacher);

    const { queue, store } = server.app.activity;
    queue.run(() => {
      store.commit(null);
      store.commit(null);
    });

    await waitForSnapshot(student, (s) => s.version === 2, 1000);
    await waitForSnapshot(teacher, (s) => s.version === 2, 1000);
    await pause(100);
    expect(snapshotsOf(student)).toEqual([
      { version: 0, activity: null },
      { version: 2, activity: null },
    ]);
    expect(snapshotsOf(teacher)).toEqual([
      { version: 0, activity: null },
      { version: 2, activity: null },
    ]);
  });
});
