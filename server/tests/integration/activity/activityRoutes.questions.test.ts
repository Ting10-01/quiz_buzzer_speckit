import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startActivityTestServer, type ActivityTestServer } from '../../helpers/activityTestServer.js';

// T037: POST /api/activity/questions/:n/open and /end (contracts/activity-http.md); AC-07, AC-17–22,
// SC-006.
let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

function post(url: string, auth = true) {
  return server.app.inject({
    method: 'POST',
    url,
    headers: auth ? { authorization: `Bearer ${server.teacherToken}` } : {},
  });
}

const open = (n: number | string, auth?: boolean) => post(`/api/activity/questions/${n}/open`, auth);
const end = (n: number | string, auth?: boolean) => post(`/api/activity/questions/${n}/end`, auth);
const createActivity = () =>
  server.app.inject({
    method: 'POST',
    url: '/api/activity',
    payload: { groupCount: 4 },
    headers: { authorization: `Bearer ${server.teacherToken}` },
  });

describe('POST /api/activity/questions/:n/open', () => {
  it('answers 200 with the teacher snapshot of OPEN(1)', async () => {
    await createActivity();
    const res = await open(1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      version: 2,
      activity: { phase: 'OPEN', currentQuestion: 1, spreadsheet: { id: 'sheet-id-activity-0001' } },
    });
  });

  it('answers 200 with the same snapshot when asked again (AC-22)', async () => {
    await createActivity();
    const first = (await open(1)).json();
    const again = await open(1);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first);
  });

  it('answers 409 QUESTION_NOT_NEXT for a question that is not next, and changes nothing (AC-21)', async () => {
    await createActivity();
    const res = await open(2);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'QUESTION_NOT_NEXT', message: '現在不能開放第 2 題' });
    expect(server.app.activity.store.current()?.phase).toBe('PREPARING');
    expect(server.app.activity.store.version()).toBe(1);
  });

  it.each(['abc', '1.5'])('answers 409 QUESTION_NOT_NEXT when :n is %s', async (n) => {
    await createActivity();
    const res = await open(n);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'QUESTION_NOT_NEXT' });
    expect(server.app.activity.store.version()).toBe(1);
  });

  it('answers 409 NO_ACTIVITY without an activity', async () => {
    const res = await open(1);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
  });

  it('answers 401 without a teacher credential and leaves the activity unchanged (AC-07, SC-006)', async () => {
    await createActivity();
    const res = await open(1, false);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: 'UNAUTHORIZED', message: '需要老師登入' });
    expect(server.app.activity.store.current()?.phase).toBe('PREPARING');
    expect(server.app.activity.store.version()).toBe(1);
  });
});

describe('POST /api/activity/questions/:n/end', () => {
  it('answers 200 with QUESTION_ENDED(1)', async () => {
    await createActivity();
    await open(1);
    const res = await end(1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 3, activity: { phase: 'QUESTION_ENDED', currentQuestion: 1 } });
  });

  it('answers FINISHED for the last question (AC-20)', async () => {
    await createActivity();
    for (let n = 1; n <= 3; n += 1) {
      await open(n);
      await end(n);
    }
    await open(4);
    const res = await end(4);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ activity: { phase: 'FINISHED', currentQuestion: 4 } });
  });

  it('answers 200 with the same snapshot when asked again (AC-22)', async () => {
    await createActivity();
    await open(1);
    const first = (await end(1)).json();
    const again = await end(1);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first);
  });

  it('answers 409 QUESTION_NOT_OPEN for a question that is not open, and changes nothing (AC-21)', async () => {
    await createActivity();
    await open(1);
    const res = await end(2);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'QUESTION_NOT_OPEN', message: '第 2 題目前沒有開放，不能結束' });
    expect(server.app.activity.store.current()).toMatchObject({ phase: 'OPEN', currentQuestion: 1 });
    expect(server.app.activity.store.version()).toBe(2);
  });

  it.each(['abc', '1.5'])('answers 409 QUESTION_NOT_OPEN when :n is %s', async (n) => {
    await createActivity();
    await open(1);
    const res = await end(n);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'QUESTION_NOT_OPEN' });
    expect(server.app.activity.store.version()).toBe(2);
  });

  it('answers 409 NO_ACTIVITY without an activity', async () => {
    const res = await end(1);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
  });

  it('answers 401 without a teacher credential and leaves the question open (AC-07, SC-006)', async () => {
    await createActivity();
    await open(1);
    const res = await end(1, false);
    expect(res.statusCode).toBe(401);
    expect(server.app.activity.store.current()).toMatchObject({ phase: 'OPEN', currentQuestion: 1 });
    expect(server.app.activity.store.version()).toBe(2);
  });
});
