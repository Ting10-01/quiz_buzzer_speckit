import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startActivityTestServer, waitForSnapshot, type ActivityTestServer } from '../../helpers/activityTestServer.js';

// T055: DELETE /api/activity (contracts/activity-http.md) with real Socket.IO connections;
// AC-07, AC-33, SC-006, SC-007.
let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

function request(method: 'POST' | 'DELETE', url: string, options: { payload?: object; auth?: boolean } = {}) {
  return server.app.inject({
    method,
    url,
    payload: options.payload,
    headers: options.auth === false ? {} : { authorization: `Bearer ${server.teacherToken}` },
  });
}

const createActivity = () => request('POST', '/api/activity', { payload: { groupCount: 4 } });
const cancelActivity = (auth?: boolean) => request('DELETE', '/api/activity', { auth });

describe('DELETE /api/activity', () => {
  it('answers 200 { version, activity: null } while PREPARING', async () => {
    await createActivity();
    const res = await cancelActivity();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: 2, activity: null });
    expect(server.app.activity.store.current()).toBeNull();
  });

  it('answers 200 with the current snapshot and changes nothing when there is no activity (AC-36)', async () => {
    const res = await cancelActivity();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: 0, activity: null });
    expect(server.app.activity.store.version()).toBe(0);
  });

  it('answers 409 CANCEL_LOCKED once question 1 has opened (AC-35)', async () => {
    await createActivity();
    const { queue, store } = server.app.activity;
    queue.run(() => store.commit({ ...store.current()!, phase: 'OPEN', currentQuestion: 1 }));
    const res = await cancelActivity();
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'CANCEL_LOCKED', message: '第 1 題開放後不能取消活動' });
    expect(store.current()?.phase).toBe('OPEN');
    expect(store.version()).toBe(2);
  });

  it('answers 401 without a teacher credential and leaves the activity unchanged (AC-07, SC-006)', async () => {
    await createActivity();
    const res = await cancelActivity(false);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: 'UNAUTHORIZED', message: '需要老師登入' });
    expect(server.app.activity.store.current()?.phase).toBe('PREPARING');
    expect(server.app.activity.store.version()).toBe(1);
  });

  it('pushes activity: null to students and the teacher within 1 second (AC-33, SC-007)', async () => {
    const student = await server.connectStudent();
    const teacher = await server.connectTeacher();
    await createActivity();
    await waitForSnapshot(student, (s) => s.activity !== null);
    await waitForSnapshot(teacher, (s) => s.activity !== null);

    await cancelActivity();
    await expect(waitForSnapshot(student, (s) => s.version === 2, 1000)).resolves.toEqual({ version: 2, activity: null });
    await expect(waitForSnapshot(teacher, (s) => s.version === 2, 1000)).resolves.toEqual({ version: 2, activity: null });
  });
});
