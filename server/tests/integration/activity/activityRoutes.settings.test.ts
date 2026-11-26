import { afterEach, describe, expect, it } from 'vitest';
import {
  fourQuestionImport,
  startActivityTestServer,
  waitForSnapshot,
  type ActivityTestServer,
  type ActivityTestServerOptions,
} from '../../helpers/activityTestServer.js';

// T024: POST /api/activity and PUT /api/activity/settings (contracts/activity-http.md);
// AC-03, AC-04, AC-07, AC-15, SC-006.
const GROUP_COUNT_INVALID = { field: 'groupCount', message: '組數必須是 2 到 20 之間的整數' };
const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: '需要老師登入' };

let server: ActivityTestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(options?: ActivityTestServerOptions): Promise<ActivityTestServer> {
  server = await startActivityTestServer(options);
  return server;
}

function send(s: ActivityTestServer, method: 'POST' | 'PUT', url: string, payload: unknown, auth = true) {
  return s.app.inject({
    method,
    url,
    payload: payload as object,
    headers: auth ? { authorization: `Bearer ${s.teacherToken}` } : {},
  });
}

const create = (s: ActivityTestServer, payload: unknown, auth?: boolean) => send(s, 'POST', '/api/activity', payload, auth);
const update = (s: ActivityTestServer, payload: unknown, auth?: boolean) =>
  send(s, 'PUT', '/api/activity/settings', payload, auth);

describe('POST /api/activity', () => {
  it('answers 200 with the teacher snapshot of the new PREPARING activity (AC-03)', async () => {
    const s = await start();
    const res = await create(s, { groupCount: 4 });
    expect(res.statusCode).toBe(200);
    const imported = fourQuestionImport();
    expect(res.json()).toEqual({
      version: 1,
      activity: {
        groupCount: 4,
        phase: 'PREPARING',
        spreadsheet: imported.spreadsheet,
        questions: imported.questions,
        groups: [1, 2, 3, 4].map((number) => ({ number, memberCount: 0 })),
      },
    });
  });

  it.each([1, 21, 3.5, '4', null])('answers 200 ValidationError for groupCount %s and creates nothing (AC-04)', async (groupCount) => {
    const s = await start();
    const res = await create(s, { groupCount });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(GROUP_COUNT_INVALID);
    expect(s.app.activity.store.current()).toBeNull();
    expect(s.app.activity.store.version()).toBe(0);
  });

  it('answers 409 ACTIVITY_EXISTS when an activity already exists', async () => {
    const s = await start();
    await create(s, { groupCount: 4 });
    const res = await create(s, { groupCount: 6 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      code: 'ACTIVITY_EXISTS',
      message: '已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器',
    });
    expect(s.app.activity.store.current()?.groupCount).toBe(4);
  });

  it('answers 409 NO_IMPORT before anything has been imported', async () => {
    const s = await start({ importResult: null });
    const res = await create(s, { groupCount: 4 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'NO_IMPORT', message: '請先匯入學習單' });
  });

  it('answers 401 without a teacher credential and creates nothing (AC-07, SC-006)', async () => {
    const s = await start();
    const res = await create(s, { groupCount: 4 }, false);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(s.app.activity.store.current()).toBeNull();
    expect(s.app.activity.store.version()).toBe(0);
  });

  it('pushes the PREPARING activity to a connected student within 1 second (AC-03, AC-15)', async () => {
    const s = await start();
    const student = await s.connectStudent();
    await waitForSnapshot(student);
    await create(s, { groupCount: 4 });
    const snapshot = await waitForSnapshot(student, (x) => x.activity?.phase === 'PREPARING', 1000);
    expect(snapshot.version).toBe(1);
    expect(snapshot.activity?.groups).toHaveLength(4);
  });
});

describe('PUT /api/activity/settings', () => {
  it('answers 200 with the new group count while PREPARING and pushes it to students', async () => {
    const s = await start();
    const student = await s.connectStudent();
    await create(s, { groupCount: 4 });
    const res = await update(s, { groupCount: 6 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 2, activity: { phase: 'PREPARING', groupCount: 6 } });
    const snapshot = await waitForSnapshot(student, (x) => x.version === 2, 1000);
    expect(snapshot.activity?.groups).toHaveLength(6);
  });

  it.each([1, 21, 3.5, 'six'])('answers 200 ValidationError for groupCount %s and leaves the activity unchanged (AC-04)', async (groupCount) => {
    const s = await start();
    await create(s, { groupCount: 4 });
    const res = await update(s, { groupCount });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(GROUP_COUNT_INVALID);
    expect(s.app.activity.store.current()?.groupCount).toBe(4);
    expect(s.app.activity.store.version()).toBe(1);
  });

  it('answers 409 NO_ACTIVITY when there is no activity', async () => {
    const s = await start();
    const res = await update(s, { groupCount: 6 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
  });

  it('answers 409 SETTINGS_LOCKED once question 1 has opened (AC-08)', async () => {
    const s = await start();
    await create(s, { groupCount: 4 });
    const { queue, store } = s.app.activity;
    queue.run(() => store.commit({ ...store.current()!, phase: 'OPEN', currentQuestion: 1 }));
    const res = await update(s, { groupCount: 6 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'SETTINGS_LOCKED', message: '第 1 題開放後不能修改設定' });
    expect(store.current()?.groupCount).toBe(4);
  });

  it('answers 401 without a teacher credential and leaves the activity unchanged (AC-07, SC-006)', async () => {
    const s = await start();
    await create(s, { groupCount: 4 });
    const res = await update(s, { groupCount: 6 }, false);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(s.app.activity.store.current()?.groupCount).toBe(4);
    expect(s.app.activity.store.version()).toBe(1);
  });
});
