import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceRegistry } from '../../src/services/createServiceRegistry';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { HttpAuthService } from '../../src/services/http/HttpAuthService';
import { MockFixtures } from '../../src/services/mock/MockFixtures';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// 004 T042: activity is bound to HttpActivityService. 005 T024: submission is bound to
// ServerSubmissionService; the result mock still runs on MockSession, which the composition root keeps
// in step with the real activity (research RA-14, 005 research RD-08).

const { sockets, FakeSocket } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  class FakeSocket {
    readonly handlers = new Map<string, Handler[]>();
    readonly anyHandlers: Handler[] = [];
    /** What the server acks for each student event. */
    readonly ack = new Map<string, unknown>();
    constructor(readonly options: unknown) {}
    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    onAny(handler: Handler) {
      this.anyHandlers.push(handler);
      return this;
    }
    connect() {
      return this;
    }
    disconnect() {
      return this;
    }
    timeout() {
      return { emitWithAck: async (event: string) => this.ack.get(event) };
    }
    /** The server accepted the handshake. */
    serverConnect() {
      for (const handler of this.handlers.get('connect') ?? []) handler();
    }
    /** The server pushes an event. */
    serverPush(event: string, payload: unknown) {
      for (const handler of this.anyHandlers) handler(event, payload);
    }
  }
  return { sockets: [] as FakeSocket[], FakeSocket };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn((options: unknown) => {
    const socket = new FakeSocket(options);
    sockets.push(socket);
    return socket;
  }),
}));

/** The registry's socket, connected, with no activity on the server yet. */
function connectedSocket() {
  const socket = sockets.at(-1);
  if (!socket) throw new Error('the registry did not open a connection');
  socket.serverConnect();
  socket.serverPush('activity:snapshot', { version: 0, activity: null });
  return socket;
}

/** 001's demo activity, so the submission mock seeds its demo submissions (M4). */
function demoActivity(overrides: Partial<Activity> = {}): Activity {
  return makeActivity({
    spreadsheet: MockFixtures.activity.spreadsheet,
    questions: MockFixtures.activity.questions,
    groupCount: 6,
    groups: makeGroups([0, 0, 0, 0, 0, 0]),
    phase: 'PREPARING',
    ...overrides,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  sockets.length = 0;
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createServiceRegistry', () => {
  it('binds activity to HttpActivityService and drops the activity mock controls (004)', () => {
    const registry = createServiceRegistry();
    expect(registry.activity).toBeInstanceOf(HttpActivityService);
    expect(registry.phaseControl).toBeUndefined();
    expect(registry.activityValidationControl).toBeUndefined();
    // result is still a mock (006).
    expect(registry.isMockMode()).toBe(true);
    expect(registry.unexpectedErrorControl).toBeDefined();
    // auth (002) and guidedNotes (003) are real, so the mock chooser is gone (001 plan).
    expect(registry.choicePrompt).toBeUndefined();
  });

  it('binds submission to ServerSubmissionService and drops the submission mock controls (005)', async () => {
    // Imported here so the other cases of this file keep running while the service does not exist yet.
    const modulePath = '../../src/services/server/ServerSubmissionService';
    const { ServerSubmissionService } = (await import(/* @vite-ignore */ modulePath)) as typeof import('../../src/services/server/ServerSubmissionService');
    const registry = createServiceRegistry();
    expect(registry.submission).toBeInstanceOf(ServerSubmissionService);
    expect(registry.judgementControl).toBeUndefined();
    expect(registry.teammateControl).toBeUndefined();
    expect(registry.submissionValidationControl).toBeUndefined();
  });

  it('binds auth to the real HttpAuthService (002)', () => {
    expect(createServiceRegistry().auth).toBeInstanceOf(HttpAuthService);
  });

  it('opens one WebSocket-only connection per registry (REQ-ACT-20)', () => {
    createServiceRegistry();
    createServiceRegistry();
    expect(sockets).toHaveLength(2);
    expect(sockets[0]!.options).toMatchObject({ transports: ['websocket'] });
  });

  it('answers getCurrentActivity from the pushed snapshot', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const activity = demoActivity();
    socket.serverPush('activity:snapshot', { version: 1, activity } satisfies ActivitySnapshot);
    await expect(registry.activity.getCurrentActivity()).resolves.toEqual(activity);
  });
});

describe('createServiceRegistry: the result mock follows the real activity (research RA-14)', () => {
  it('gives the result mock the activity the server pushed', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const twoQuestions = demoActivity({ questions: MockFixtures.activity.questions.slice(0, 2) });
    socket.serverPush('activity:snapshot', { version: 1, activity: twoQuestions });
    await expect(registry.result.getAllResults()).resolves.toHaveLength(2);
  });

  it('forgets the activity when the activity is cancelled (001 RD-12)', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const twoQuestions = demoActivity({ questions: MockFixtures.activity.questions.slice(0, 2) });
    socket.ack.set('group:join', { snapshot: { version: 1, activity: twoQuestions }, studentToken: 'student-1' } satisfies GroupAck);
    await registry.activity.joinGroup(3);

    socket.serverPush('activity:snapshot', { version: 2, activity: null });
    // Back to the 001 fixed activity (4 questions) once the teacher activity is gone.
    await expect(registry.result.getAllResults()).resolves.toHaveLength(MockFixtures.activity.questions.length);
  });

  it('keeps handing a real import to the result mock, which writes back to it (003)', async () => {
    const imported = {
      spreadsheet: { id: 'sheet-1', title: 'T', editable: false, worksheets: ['W'], selectedWorksheet: 'W' },
      headerRow: 1,
      headerColumns: ['A', 'B'],
      questions: [{ number: 7, type: 'SINGLE', text: '第七題', subQuestions: [{ index: 1, blankCell: 'B2' }] }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(imported)));
    const registry = createServiceRegistry();
    await registry.guidedNotes.readWorksheet('sheet-1', 'W');
    await expect(registry.result.writeBack()).resolves.toMatchObject({ ok: false });
  });

  it('keeps separate state per registry (one per tab)', async () => {
    const a = createServiceRegistry();
    const socketA = connectedSocket();
    const b = createServiceRegistry();
    connectedSocket();
    socketA.serverPush('activity:snapshot', { version: 1, activity: demoActivity() });
    await expect(a.activity.getCurrentActivity()).resolves.not.toBeNull();
    await expect(b.activity.getCurrentActivity()).resolves.toBeNull();
  });
});
