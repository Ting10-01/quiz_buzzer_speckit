import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceRegistry } from '../../src/services/createServiceRegistry';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { HttpAuthService } from '../../src/services/http/HttpAuthService';
import { ServerResultService } from '../../src/services/ServerResultService';
import { MockFixtures } from '../../src/services/mock/MockFixtures';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// 004 T042: activity is bound to HttpActivityService. 005 T024: submission is bound to
// ServerSubmissionService. 006 T031: result is bound to ServerResultService, so nothing is a mock.

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

/** 001's demo activity. */
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

beforeEach(() => {
  sockets.length = 0;
  sessionStorage.clear();
});

describe('createServiceRegistry', () => {
  it('binds activity to HttpActivityService and drops the activity mock controls (004)', () => {
    const registry = createServiceRegistry();
    expect(registry.activity).toBeInstanceOf(HttpActivityService);
    expect(registry.phaseControl).toBeUndefined();
    expect(registry.activityValidationControl).toBeUndefined();
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

  it('binds result to ServerResultService and leaves mock mode (006)', () => {
    const registry = createServiceRegistry();
    expect(registry.result).toBeInstanceOf(ServerResultService);
    expect(registry.isMockMode()).toBe(false);
    expect(registry.unexpectedErrorControl).toBeUndefined();
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

describe('createServiceRegistry: one registry per tab', () => {
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
