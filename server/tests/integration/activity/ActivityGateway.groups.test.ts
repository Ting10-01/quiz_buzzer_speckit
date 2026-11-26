import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emitWithAck,
  snapshotsOf,
  startActivityTestServer,
  waitForSnapshot,
  type ActivityTestServer,
} from '../../helpers/activityTestServer.js';

// T030: group:join / group:leave over real Socket.IO connections (contracts/socket-events.md);
// AC-09 to AC-14, AC-16, SC-003. AC-15 is covered elsewhere: the push to students in T024
// (activityRoutes.settings.test.ts), the S-Join page in T044's e2e (Phase 5).
let server: ActivityTestServer;

const BLANK_SPREADSHEET = { id: '', title: '', editable: false, worksheets: [], selectedWorksheet: '' };

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

async function createActivity(groupCount = 6): Promise<void> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/activity',
    payload: { groupCount },
    headers: { authorization: `Bearer ${server.teacherToken}` },
  });
  expect(res.statusCode).toBe(200);
}

/** Question `n` has opened (Phase 5's openQuestion is not here yet). */
function openQuestion(n = 1): void {
  const { queue, store } = server.app.activity;
  queue.run(() => store.commit({ ...store.current()!, phase: 'OPEN', currentQuestion: n }));
}

const join = (socket: Socket, groupNumber: unknown) => emitWithAck<GroupAck>(socket, 'group:join', { groupNumber });
const leave = (socket: Socket) => emitWithAck<GroupAck>(socket, 'group:leave', {});
const groupOf = (socket: Socket) => server.app.activity.membership.groupOf({ id: socket.id! });
const counts = (ack: GroupAck) => ack.snapshot.activity!.groups.map((group) => group.memberCount);

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('group:join', () => {
  it('answers a studentToken and the teacher sees group 3 grow by 1 within 1 second (AC-09)', async () => {
    await createActivity();
    const teacher = await server.connectTeacher();
    const student = await server.connectStudent();
    await waitForSnapshot(teacher, (s) => s.activity !== null);

    const ack = await join(student, 3);
    expect(ack.error).toBeUndefined();
    expect(ack.studentToken).toEqual(expect.any(String));
    expect(ack.snapshot.activity).toMatchObject({ phase: 'PREPARING', groupCount: 6 });
    expect(counts(ack)).toEqual([0, 0, 1, 0, 0, 0]);

    const pushed = await waitForSnapshot(teacher, (s) => s.activity?.groups[2]?.memberCount === 1, 1000);
    expect(pushed.version).toBe(ack.snapshot.version);
    expect(groupOf(student)).toBe(3);
  });

  it('counts two connections in group 3 as 2 members (AC-10)', async () => {
    await createActivity();
    const a = await server.connectStudent();
    const b = await server.connectStudent();
    await join(a, 3);
    const ack = await join(b, 3);
    expect(ack.error).toBeUndefined();
    expect(counts(ack)).toEqual([0, 0, 2, 0, 0, 0]);
  });

  it('moves from group 3 to group 5 while PREPARING (AC-11)', async () => {
    await createActivity();
    const student = await server.connectStudent();
    await join(student, 3);
    await leave(student);
    const ack = await join(student, 5);
    expect(ack.error).toBeUndefined();
    expect(counts(ack)).toEqual([0, 0, 0, 0, 1, 0]);
    expect(groupOf(student)).toBe(5);
  });

  it('moves straight to another group while PREPARING without leaving first (AC-11)', async () => {
    await createActivity();
    const student = await server.connectStudent();
    await join(student, 3);
    const ack = await join(student, 5);
    expect(ack.error).toBeUndefined();
    expect(counts(ack)).toEqual([0, 0, 0, 0, 1, 0]);
  });

  it('refuses moving or leaving once question 1 has opened; the tab stays in group 3 (AC-12)', async () => {
    await createActivity();
    const student = await server.connectStudent();
    await join(student, 3);
    openQuestion(1);

    const moved = await join(student, 5);
    expect(moved.error).toEqual({ code: 'GROUP_LOCKED', message: '第 1 題開放後不能換組，你在第 3 組' });
    expect(counts(moved)).toEqual([0, 0, 1, 0, 0, 0]);

    const left = await leave(student);
    expect(left.error).toEqual({ code: 'GROUP_LOCKED', message: '第 1 題開放後不能換組，你在第 3 組' });
    expect(counts(left)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(groupOf(student)).toBe(3);
  });

  it('lets a new connection join group 4 while question 2 is open (AC-13)', async () => {
    await createActivity();
    openQuestion(2);
    const student = await server.connectStudent();
    const ack = await join(student, 4);
    expect(ack.error).toBeUndefined();
    expect(ack.snapshot.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
    expect(counts(ack)).toEqual([0, 0, 0, 1, 0, 0]);
    expect(groupOf(student)).toBe(4);
  });

  it('brings a refreshed tab back to its group with the same studentToken, without counting it twice (AC-14)', async () => {
    await createActivity();
    const before = await server.connectStudent();
    const first = await join(before, 3);
    openQuestion(2);
    before.disconnect();

    const after = await server.connectStudent(first.studentToken);
    expect(groupOf(after)).toBe(3);
    const ack = await join(after, 3);
    expect(ack.error).toBeUndefined();
    expect(ack.snapshot.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
    expect(counts(ack)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(groupOf(after)).toBe(3);

    const other = await join(after, 5);
    expect(other.error).toEqual({ code: 'GROUP_LOCKED', message: '第 1 題開放後不能換組，你在第 3 組' });
  });

  it('ignores a studentToken the server does not know: the tab counts as not joined', async () => {
    await createActivity();
    const student = await server.connectStudent('token-the-server-never-issued');
    expect(groupOf(student)).toBeNull();
    const ack = await join(student, 2);
    expect(ack.error).toBeUndefined();
    expect(ack.studentToken).not.toBe('token-the-server-never-issued');
    expect(counts(ack)).toEqual([0, 1, 0, 0, 0, 0]);
  });

  it('refuses with NO_ACTIVITY when there is no activity', async () => {
    const student = await server.connectStudent();
    const ack = await join(student, 1);
    expect(ack).toEqual({
      snapshot: { version: 0, activity: null },
      error: { code: 'NO_ACTIVITY', message: '目前沒有活動' },
    });
  });

  it('refuses a group outside 1 to groupCount with NO_SUCH_GROUP', async () => {
    await createActivity(6);
    const student = await server.connectStudent();
    const ack = await join(student, 7);
    expect(ack.error).toEqual({ code: 'NO_SUCH_GROUP', message: '沒有第 7 組' });
    expect(groupOf(student)).toBeNull();
  });

  it.each([['3'], [3.5], [null], [undefined]])('answers an error when groupNumber is %s', async (groupNumber) => {
    await createActivity(6);
    const student = await server.connectStudent();
    const ack = await join(student, groupNumber);
    expect(ack.error?.code).toBe('NO_SUCH_GROUP');
    expect(ack.studentToken).toBeUndefined();
    expect(counts(ack)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(groupOf(student)).toBeNull();
  });

  it('answers an error when the payload is not an object', async () => {
    await createActivity(6);
    const student = await server.connectStudent();
    const ack = await emitWithAck<GroupAck>(student, 'group:join', 3);
    expect(ack.error?.code).toBe('NO_SUCH_GROUP');
    expect(groupOf(student)).toBeNull();
  });
});

describe('group:leave', () => {
  it('leaves the group while PREPARING', async () => {
    await createActivity();
    const student = await server.connectStudent();
    await join(student, 3);
    const ack = await leave(student);
    expect(ack.error).toBeUndefined();
    expect(counts(ack)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(groupOf(student)).toBeNull();
  });
});

describe('what students receive (AC-16, SC-003)', () => {
  it('gives students only a blank spreadsheet, in pushes and acks; the teacher gets the real one', async () => {
    const student = await server.connectStudent();
    const teacher = await server.connectTeacher();
    await createActivity();
    const acks = [await join(student, 3), await leave(student), await join(student, 2)];
    openQuestion(1);
    acks.push(await join(student, 5));
    await waitForSnapshot(student, (s) => s.activity?.phase === 'OPEN');
    await waitForSnapshot(teacher, (s) => s.activity?.phase === 'OPEN');
    await pause(50);

    const studentActivities = [...snapshotsOf(student), ...acks.map((ack) => ack.snapshot)]
      .map((s) => s.activity)
      .filter((a) => a !== null);
    expect(studentActivities.length).toBeGreaterThan(0);
    for (const activity of studentActivities) expect(activity.spreadsheet).toEqual(BLANK_SPREADSHEET);
    expect(JSON.stringify([...snapshotsOf(student), ...acks])).not.toContain('sheet-id-activity-0001');

    const teacherActivities = snapshotsOf(teacher)
      .map((s) => s.activity)
      .filter((a) => a !== null);
    expect(teacherActivities.length).toBeGreaterThan(0);
    for (const activity of teacherActivities) expect(activity.spreadsheet.id).toBe('sheet-id-activity-0001');
  });
});
