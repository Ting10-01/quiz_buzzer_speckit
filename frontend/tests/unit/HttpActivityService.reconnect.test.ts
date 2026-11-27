import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { RealtimeClient } from '../../src/services/RealtimeClient';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// T049: the tab reconnects when its teacher credential changes, and never retries one 002 refused
// (contracts/activity-service.md, research RA-07, 002 #18; AC-26, AC-32, REQ-ACT-21).

type Auth = { teacherToken?: string; studentToken?: string };
type Handler = (...args: unknown[]) => void;

/** Stands in for socket.io-client's Socket: records every handshake; tests play the server. */
class FakeSocket {
  readonly handshakes: Auth[] = [];
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly anyHandlers = new Set<Handler>();

  constructor(private readonly auth: (cb: (auth: Auth) => void) => void) {}

  on(event: string, handler: Handler): this {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    this.handlers.set(event, set);
    set.add(handler);
    return this;
  }

  onAny(handler: Handler): this {
    this.anyHandlers.add(handler);
    return this;
  }

  /** A new handshake: the auth callback is read again, like socket.io-client does. */
  connect(): this {
    this.auth((auth) => this.handshakes.push(auth));
    return this;
  }

  disconnect(): this {
    return this;
  }

  /** The server accepted the last handshake. */
  serverAccepts(): void {
    this.fire('connect');
  }

  serverPush(snapshot: ActivitySnapshot): void {
    for (const handler of [...this.anyHandlers]) handler('activity:snapshot', snapshot);
  }

  /** The server closed the connection (002 drops old teacher sockets with this reason). */
  serverDisconnects(reason: string): void {
    this.fire('disconnect', reason);
  }

  /** The server refused the last handshake. */
  serverRefuses(message: string): void {
    this.fire('connect_error', new Error(message));
  }

  lastHandshake(): Auth {
    return this.handshakes[this.handshakes.length - 1]!;
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }
}

let stored: string | null;
let socket: FakeSocket;
let api: { request: ReturnType<typeof vi.fn> };
let service: HttpActivityService;

function live(overrides: Partial<Activity> = {}): Activity {
  return makeActivity({ phase: 'OPEN', currentQuestion: 2, groups: makeGroups([1, 1, 0, 0]), ...overrides });
}

/** What a student connection receives: the spreadsheet is blanked (REQ-ACT-19). */
function studentView(activity: Activity): Activity {
  return { ...activity, spreadsheet: { id: '', title: '', editable: false, worksheets: [], selectedWorksheet: '' } };
}

beforeEach(() => {
  stored = null;
  api = { request: vi.fn().mockResolvedValue({ version: 9, activity: live() }) };
  const realtime = new RealtimeClient({ get: () => stored }, (options) => {
    socket = new FakeSocket(options.auth as (cb: (auth: Auth) => void) => void);
    return socket.connect() as never;
  });
  service = new HttpActivityService(realtime, api as never);
  realtime.connect();
});

/** The tab is connected (as a student when there is no credential) and has the snapshot of `version`. */
function connectedWith(version: number, activity: Activity | null): void {
  socket.serverAccepts();
  socket.serverPush({ version, activity });
}

const teacherCommands = [
  { name: 'createActivity', call: (s: HttpActivityService) => s.createActivity({ groupCount: 4 }) },
  { name: 'updateSettings', call: (s: HttpActivityService) => s.updateSettings({ groupCount: 4 }) },
  { name: 'cancelActivity', call: (s: HttpActivityService) => s.cancelActivity() },
  { name: 'openQuestion', call: (s: HttpActivityService) => s.openQuestion(3) },
  { name: 'endQuestion', call: (s: HttpActivityService) => s.endQuestion(2) },
] as const;

describe('HttpActivityService when the teacher credential changes', () => {
  it('reconnects as the teacher before getCurrentActivity and answers the teacher snapshot, not the student one (AC-26)', async () => {
    connectedWith(5, studentView(live()));
    stored = 'teacher-1';

    const current = service.getCurrentActivity();

    expect(socket.handshakes).toHaveLength(2);
    expect(socket.lastHandshake()).toEqual({ teacherToken: 'teacher-1' });
    // Same version as the student snapshot: still taken, because it is the first since reconnecting.
    connectedWith(5, live());
    await expect(current).resolves.toEqual(live());
  });

  it.each(teacherCommands)('reconnects as the teacher before $name', async ({ call }) => {
    connectedWith(5, studentView(live()));
    stored = 'teacher-1';
    api.request.mockImplementation(async () => {
      // The handshake with the new credential went out before the command was sent.
      expect(socket.lastHandshake()).toEqual({ teacherToken: 'teacher-1' });
      return { version: 9, activity: live() };
    });

    await call(service);

    expect(api.request).toHaveBeenCalledTimes(1);
    expect(socket.handshakes).toHaveLength(2);
  });

  it.each(teacherCommands)('does not reconnect before $name when the credential is the one connected with', async ({ call }) => {
    stored = 'teacher-1';
    socket.handshakes.length = 0;
    socket.connect();
    connectedWith(5, live());

    await call(service);

    expect(socket.handshakes).toHaveLength(1);
  });

  it('reconnects by itself when the server drops the connection after another sign-in (io server disconnect)', () => {
    stored = 'teacher-1';
    socket.handshakes.length = 0;
    socket.connect();
    connectedWith(5, live());
    stored = 'teacher-2';

    socket.serverDisconnects('io server disconnect');

    expect(socket.handshakes).toHaveLength(2);
    expect(socket.lastHandshake()).toEqual({ teacherToken: 'teacher-2' });
  });

  it('leaves other disconnects to Socket.IO and does not open a handshake itself', () => {
    connectedWith(5, live());
    socket.serverDisconnects('transport close');
    expect(socket.handshakes).toHaveLength(1);
  });

  it('reconnects as a student once its credential is refused (UNAUTHORIZED) and the tab has no new one (AC-32)', () => {
    stored = 'teacher-1';
    socket.handshakes.length = 0;
    socket.connect();
    connectedWith(5, live());

    socket.serverDisconnects('io server disconnect');
    socket.serverRefuses('UNAUTHORIZED');

    expect(socket.handshakes).toEqual([{ teacherToken: 'teacher-1' }, { teacherToken: 'teacher-1' }, {}]);
  });

  it('retries with the new credential when the tab signed in again before the refusal', () => {
    stored = 'teacher-1';
    socket.handshakes.length = 0;
    socket.connect();
    socket.serverAccepts();
    stored = 'teacher-2';

    socket.serverRefuses('UNAUTHORIZED');

    expect(socket.lastHandshake()).toEqual({ teacherToken: 'teacher-2' });
  });

  it('never reconnects for a refused credential the tab still keeps (002 #18): two teacher commands, no extra handshake', async () => {
    stored = 'teacher-1';
    socket.handshakes.length = 0;
    socket.connect();
    connectedWith(5, live());
    socket.serverDisconnects('io server disconnect');
    socket.serverRefuses('UNAUTHORIZED');
    connectedWith(7, studentView(live()));
    const handshakes = socket.handshakes.length;

    await service.openQuestion(3);
    await service.endQuestion(3);

    expect(socket.handshakes).toHaveLength(handshakes);
  });

  it('answers the snapshot received after reconnecting as a student when the refused credential is kept', async () => {
    stored = 'teacher-1';
    socket.handshakes.length = 0;
    socket.connect();
    connectedWith(5, live());
    socket.serverDisconnects('io server disconnect');
    socket.serverRefuses('UNAUTHORIZED');
    connectedWith(3, studentView(live()));

    await expect(service.getCurrentActivity()).resolves.toEqual(studentView(live()));
    expect(socket.lastHandshake()).toEqual({});
  });
});
