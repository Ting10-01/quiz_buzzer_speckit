import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEACHER_ROOM } from '../../src/realtime/socketServer.js';
import { signInFor } from '../helpers/fakeGoogleGateway.js';
import { listenTestApp, type TestApp } from '../helpers/testApp.js';

let t: TestApp & { url: string };
const sockets: Socket[] = [];

function open(auth: Record<string, unknown> = {}, transports = ['websocket']): Socket {
  const socket = connect(t.url, { auth, transports, reconnection: false, forceNew: true });
  sockets.push(socket);
  return socket;
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

function rejected(socket: Socket): Promise<Error> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('connection was accepted')));
    socket.once('connect_error', resolve);
  });
}

// Resolves with the messages received within `ms`.
function collect(socket: Socket, event: string, ms = 150): Promise<unknown[]> {
  const received: unknown[] = [];
  socket.on(event, (payload) => received.push(payload));
  return new Promise((resolve) => setTimeout(() => resolve(received), ms));
}

async function signIn(code: string): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/google',
    headers: { 'x-requested-with': 'XmlHttpRequest' },
    payload: { code },
  });
  return res.json().teacherToken;
}

async function serverSocketData(): Promise<unknown[]> {
  return (await t.app.io.fetchSockets()).map((socket) => socket.data);
}

beforeEach(async () => {
  t = await listenTestApp();
  t.gateway.set('code-a', signInFor('teacher.a@example.com')).set('code-b', signInFor('teacher.b@example.com'));
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await t.app.close();
});

describe('Socket.IO handshake', () => {
  it('accepts a connection without a teacher token as a non-teacher outside TEACHER_ROOM', async () => {
    const student = open();
    await connected(student);
    expect(await serverSocketData()).toEqual([{ isTeacher: false }]);

    const messages = collect(student, 'teacher-only');
    t.app.io.to(TEACHER_ROOM).emit('teacher-only', 'secret');
    expect(await messages).toEqual([]);
  });

  it.each([
    ['a wrong token', async () => 'x'.repeat(43)],
    ['a token that is not a string', async () => 12345],
    [
      'a voided token',
      async () => {
        const old = await signIn('code-a');
        await signIn('code-b');
        return old;
      },
    ],
  ])('rejects %s with UNAUTHORIZED', async (_name, token) => {
    const error = await rejected(open({ teacherToken: await token() }));
    expect(error.message).toBe('UNAUTHORIZED');
  });

  it('accepts a valid teacher token, marks it as teacher and delivers teacher messages', async () => {
    const teacher = open({ teacherToken: await signIn('code-a') });
    const student = open();
    await Promise.all([connected(teacher), connected(student)]);
    expect(await serverSocketData()).toContainEqual({ isTeacher: true });

    const teacherMessages = collect(teacher, 'teacher-only');
    const studentMessages = collect(student, 'teacher-only');
    t.app.io.to(TEACHER_ROOM).emit('teacher-only', 'for the teacher');
    expect(await teacherMessages).toEqual(['for the teacher']);
    expect(await studentMessages).toEqual([]);
  });

  it.each([
    ['the same account', 'code-a'],
    ['another account', 'code-b'],
  ])('disconnects the old teacher socket when %s signs in, and rejects its reconnect', async (_name, code) => {
    const oldToken = await signIn('code-a');
    const oldTeacher = open({ teacherToken: oldToken });
    const student = open();
    await Promise.all([connected(oldTeacher), connected(student)]);

    const reason = new Promise((resolve) => oldTeacher.once('disconnect', resolve));
    const newToken = await signIn(code);
    expect(await reason).toBe('io server disconnect');
    expect(student.connected).toBe(true);

    const error = await rejected(open({ teacherToken: oldToken }));
    expect(error.message).toBe('UNAUTHORIZED');
    await connected(open({ teacherToken: newToken }));
  });

  it('does not accept the HTTP long-polling transport', async () => {
    await rejected(open({}, ['polling']));
  });
});
