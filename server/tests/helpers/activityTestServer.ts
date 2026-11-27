import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import { io as connect, type Socket } from 'socket.io-client';
import { signInFor } from './fakeGoogleGateway.js';
import { listenTestApp, type TestApp } from './testApp.js';

export const DEFAULT_TIMEOUT_MS = 2000;

// A 4-question import, standing in for what 003's GuidedNotesImporter leaves in ImportStore.
export function fourQuestionImport(): ImportSuccess {
  return {
    spreadsheet: {
      id: 'sheet-id-activity-0001',
      title: '第三課學習單',
      editable: true,
      worksheets: ['學習單'],
      selectedWorksheet: '學習單',
    },
    headerRow: 4,
    headerColumns: ['B', 'C', 'G'],
    questions: [1, 2, 3, 4].map((number) => ({
      number,
      type: 'SINGLE' as const,
      text: `第 ${number} 題`,
      subQuestions: [{ index: 1, blankCell: `G${number + 4}` }],
    })),
  };
}

// A 4-question import whose question 1 is a group of 2 sub-questions; the rest are single questions.
export function groupQuestionImport(): ImportSuccess {
  const base = fourQuestionImport();
  return {
    ...base,
    spreadsheet: { ...base.spreadsheet, id: 'sheet-id-submission-0001' },
    questions: [
      {
        number: 1,
        type: 'GROUP' as const,
        text: '第 1 題',
        subQuestions: [
          { index: 1, blankCell: 'G5' },
          { index: 2, blankCell: 'G6' },
        ],
      },
      ...[2, 3, 4].map((number) => ({
        number,
        type: 'SINGLE' as const,
        text: `第 ${number} 題`,
        subQuestions: [{ index: 1, blankCell: `G${number + 5}` }],
      })),
    ],
  };
}

export interface ActivityTestServerOptions {
  // What 003's ImportStore.latest() returns; null means nothing has been imported. Default: fourQuestionImport().
  importResult?: ImportSuccess | null;
}

export interface ActivityTestServer extends TestApp {
  url: string;
  // The current teacher credential (002 sign-in through the fake Google gateway).
  teacherToken: string;
  // Someone signs in again: 002 voids the old credential and drops its sockets. Returns the new one.
  rotateTeacher(): Promise<string>;
  // Resolves once connected; rejects with the connect_error (e.g. message 'UNAUTHORIZED').
  connectTeacher(token?: string): Promise<Socket>;
  connectStudent(studentToken?: string): Promise<Socket>;
  close(): Promise<void>;
}

const snapshotHistory = new WeakMap<Socket, ActivitySnapshot[]>();

// 002's buildApp (with app.io and 004's activity module) on a random port; teacher sign-in and
// 003's import are replaced by test doubles.
export async function startActivityTestServer(options: ActivityTestServerOptions = {}): Promise<ActivityTestServer> {
  const t = await listenTestApp();
  const importResult = options.importResult === undefined ? fourQuestionImport() : options.importResult;
  if (importResult) t.app.importStore.save(importResult, {});

  const sockets: Socket[] = [];
  let signIns = 0;

  async function signIn(): Promise<string> {
    signIns++;
    const code = `activity-test-code-${signIns}`;
    t.gateway.set(code, signInFor(`teacher${signIns}@example.com`));
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers: { 'x-requested-with': 'XmlHttpRequest' },
      payload: { code },
    });
    const token: unknown = res.json().teacherToken;
    if (typeof token !== 'string') throw new Error(`teacher sign-in failed: ${res.body}`);
    return token;
  }

  function open(auth: Record<string, string>): Promise<Socket> {
    // Only WebSocket, like the real front end (REQ-ACT-20). Snapshots are recorded from the start,
    // so the one sent right after connecting is never missed.
    const socket = connect(t.url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    const history: ActivitySnapshot[] = [];
    snapshotHistory.set(socket, history);
    socket.on('activity:snapshot', (snapshot: ActivitySnapshot) => history.push(snapshot));
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  const server: ActivityTestServer = {
    ...t,
    teacherToken: await signIn(),
    async rotateTeacher() {
      server.teacherToken = await signIn();
      return server.teacherToken;
    },
    connectTeacher(token) {
      return open({ teacherToken: token ?? server.teacherToken });
    },
    connectStudent(studentToken) {
      return open(studentToken === undefined ? {} : { studentToken });
    },
    async close() {
      for (const socket of sockets.splice(0)) socket.disconnect();
      await t.app.close();
    },
  };
  return server;
}

// Every activity:snapshot this socket has received so far, oldest first.
export function snapshotsOf(socket: Socket): ActivitySnapshot[] {
  return [...(snapshotHistory.get(socket) ?? [])];
}

// The first snapshot (already received or still to come) that matches `predicate`.
export function waitForSnapshot(
  socket: Socket,
  predicate: (snapshot: ActivitySnapshot) => boolean = () => true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ActivitySnapshot> {
  const found = snapshotsOf(socket).find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const listener = (snapshot: ActivitySnapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      socket.off('activity:snapshot', listener);
      resolve(snapshot);
    };
    const timer = setTimeout(() => {
      socket.off('activity:snapshot', listener);
      reject(new Error(`no matching activity:snapshot within ${timeoutMs} ms`));
    }, timeoutMs);
    socket.on('activity:snapshot', listener);
  });
}

// The next `event` on this socket whose payload matches `predicate`; rejects after `timeoutMs`.
// Unlike waitForSnapshot it keeps no history, so start waiting before triggering the event.
export function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`no matching ${event} within ${timeoutMs} ms`));
    }, timeoutMs);
    socket.on(event, listener);
  });
}

// Sends a student event and resolves with the server's ack (e.g. GroupAck for group:join).
export function emitWithAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return socket.timeout(timeoutMs).emitWithAck(event, payload) as Promise<T>;
}
