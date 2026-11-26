import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import { Judgement, type Activity } from '@quiz-buzzer/shared/entities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceRegistry } from '../../src/services/createServiceRegistry';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { HttpAuthService } from '../../src/services/http/HttpAuthService';
import { MockFixtures } from '../../src/services/mock/MockFixtures';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// 004 T042: activity is bound to HttpActivityService; the submission and result mocks still run on
// MockSession, which the composition root keeps in step with the real activity (research RA-14).

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
    // submission and result are still mocks (005, 006).
    expect(registry.isMockMode()).toBe(true);
    expect(registry.judgementControl).toBeDefined();
    expect(registry.teammateControl).toBe(registry.submission);
    expect(registry.submissionValidationControl).toBeDefined();
    expect(registry.unexpectedErrorControl).toBeDefined();
    // auth (002) and guidedNotes (003) are real, so the mock chooser is gone (001 plan).
    expect(registry.choicePrompt).toBeUndefined();
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

describe('createServiceRegistry: MockSession follows the real activity (research RA-14)', () => {
  it('gives the submission mock the group this tab joined', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const open = demoActivity({ phase: 'OPEN', currentQuestion: 1 });
    socket.ack.set('group:join', { snapshot: { version: 2, activity: open }, studentToken: 'student-1' } satisfies GroupAck);

    await registry.activity.joinGroup(3);
    await expect(registry.submission.submitAnswer(1, ['a', 'b'])).resolves.toMatchObject({ groupNumber: 3 });
  });

  it('forgets the group after leaving it', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const preparing = demoActivity();
    socket.ack.set('group:join', { snapshot: { version: 2, activity: preparing }, studentToken: 'student-1' } satisfies GroupAck);
    socket.ack.set('group:leave', { snapshot: { version: 3, activity: preparing } } satisfies GroupAck);

    await registry.activity.joinGroup(3);
    await registry.activity.leaveGroup();
    await expect(registry.submission.submitAnswer(1, ['a', 'b'])).rejects.toThrow();
  });

  it('gives the result mock the activity the server pushed', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const twoQuestions = demoActivity({ questions: MockFixtures.activity.questions.slice(0, 2) });
    socket.serverPush('activity:snapshot', { version: 1, activity: twoQuestions });
    await expect(registry.result.getAllResults()).resolves.toHaveLength(2);
  });

  it('forgets the activity and the group when the activity is cancelled (001 RD-12)', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    const twoQuestions = demoActivity({ questions: MockFixtures.activity.questions.slice(0, 2) });
    socket.ack.set('group:join', { snapshot: { version: 1, activity: twoQuestions }, studentToken: 'student-1' } satisfies GroupAck);
    await registry.activity.joinGroup(3);

    socket.serverPush('activity:snapshot', { version: 2, activity: null });
    await expect(registry.submission.submitAnswer(1, ['a', 'b'])).rejects.toThrow();
    // Back to the 001 fixed activity (4 questions) once the teacher activity is gone.
    await expect(registry.result.getAllResults()).resolves.toHaveLength(MockFixtures.activity.questions.length);
  });

  it('ends the question on the server when the mock judge accepts, and answers the server activity', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    socket.serverPush('activity:snapshot', { version: 1, activity: demoActivity({ phase: 'OPEN', currentQuestion: 1 }) });
    const ended = demoActivity({ phase: 'QUESTION_ENDED', currentQuestion: 1, groups: makeGroups([1, 0, 0, 0, 0, 0]) });
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ version: 2, activity: ended }));
    vi.stubGlobal('fetch', fetch);

    // Group 2 is the earliest demo submission for question 1 (M4).
    const submissions = await registry.submission.listSubmissions(1);
    const earliest = [...submissions].sort((a, b) => a.rank - b.rank)[0]!;
    const outcome = await registry.submission.judge(1, earliest.groupNumber, Judgement.ACCEPTED);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect([init.method, url]).toEqual(['POST', '/api/activity/questions/1/end']);
    expect(outcome.activity).toEqual(ended);
  });

  it('leaves the server alone when the mock judge does not accept', async () => {
    const registry = createServiceRegistry();
    const socket = connectedSocket();
    socket.serverPush('activity:snapshot', { version: 1, activity: demoActivity({ phase: 'OPEN', currentQuestion: 1 }) });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const submissions = await registry.submission.listSubmissions(1);
    const earliest = [...submissions].sort((a, b) => a.rank - b.rank)[0]!;
    const outcome = await registry.submission.judge(1, earliest.groupNumber, Judgement.REJECTED);

    expect(fetch).not.toHaveBeenCalled();
    expect(outcome.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 1 });
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
