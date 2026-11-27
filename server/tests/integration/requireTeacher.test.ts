import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInFor } from '../helpers/fakeGoogleGateway.js';
import { createTestApp, type TestApp } from '../helpers/testApp.js';
import { FakeSpreadsheetReader } from '../guided-notes/helpers/fakeSpreadsheetReader.js';
import { loadFixture } from '../guided-notes/helpers/gridBuilder.js';

const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: '需要老師登入' };

let t: TestApp;
let counter: number;
let reader: FakeSpreadsheetReader;

async function signIn(code: string): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/google',
    headers: { 'x-requested-with': 'XmlHttpRequest' },
    payload: { code },
  });
  return res.json().teacherToken;
}

beforeEach(async () => {
  counter = 0;
  // 003 routes: a rejected request must not read any spreadsheet (AC-26).
  reader = new FakeSpreadsheetReader().set('spreadsheet-id-0001', loadFixture('single'));
  t = await createTestApp({
    spreadsheetReader: reader,
    beforeReady: (app) => {
      // A teacher-only route that changes state, so a rejected request is observable.
      app.post('/test/teacher-only', { preHandler: app.requireTeacher }, async () => ({ counter: ++counter }));
    },
  });
  t.gateway.set('code-a', signInFor('teacher.a@example.com')).set('code-b', signInFor('teacher.b@example.com'));
});

afterEach(async () => {
  await t.app.close();
});

describe('requireTeacher', () => {
  it('accepts the current teacher token', async () => {
    const token = await signIn('code-a');
    const res = await t.app.inject({ method: 'POST', url: '/test/teacher-only', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(counter).toBe(1);
  });

  it.each([
    ['no header', async () => ({})],
    ['Basic scheme', async () => ({ authorization: 'Basic dGVhY2hlcjpwYXNz' })],
    ['empty Bearer', async () => ({ authorization: 'Bearer' })],
    ['Bearer with a blank token', async () => ({ authorization: 'Bearer ' })],
    ['a wrong token', async () => ({ authorization: `Bearer ${'x'.repeat(43)}` })],
    ['the raw token without a scheme', async () => ({ authorization: await signIn('code-a') })],
    [
      'a voided token',
      async () => {
        const old = await signIn('code-a');
        await signIn('code-b');
        return { authorization: `Bearer ${old}` };
      },
    ],
    ['the token in a cookie only', async () => ({ cookie: `teacherToken=${await signIn('code-a')}` })],
  ])('rejects %s with 401 and does not run the route', async (_name, headers) => {
    const res = await t.app.inject({ method: 'POST', url: '/test/teacher-only', headers: await headers() });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(counter).toBe(0);
  });
});

// Every teacher-only route in the server. 003–006 MUST add each new teacher-only route here
// (contracts/server-extension.md; SC-002).
const TEACHER_ONLY_ROUTES = [
  { method: 'GET', url: '/api/auth/me' },
  { method: 'GET', url: '/api/auth/picker-token' },
  { method: 'GET', url: '/api/guided-notes/spreadsheets/spreadsheet-id-0001' },
  { method: 'POST', url: '/api/guided-notes/read', payload: { spreadsheetId: 'spreadsheet-id-0001', worksheet: '學習單' } },
  // 004 (T024, T055)
  { method: 'POST', url: '/api/activity', payload: { groupCount: 4 } },
  { method: 'PUT', url: '/api/activity/settings', payload: { groupCount: 6 } },
  { method: 'DELETE', url: '/api/activity' },
  // 004 (T037)
  { method: 'POST', url: '/api/activity/questions/1/open' },
  { method: 'POST', url: '/api/activity/questions/1/end' },
  // 005 (T039)
  { method: 'GET', url: '/api/questions/1/submissions' },
  // 005 (T022)
  { method: 'POST', url: '/api/questions/1/judgements', payload: { groupNumber: 1, judgement: 'ACCEPTED' } },
  // 006
  { method: 'POST', url: '/api/results/write-back' },
] as const;

describe('teacher-only route list', () => {
  it.each(TEACHER_ONLY_ROUTES)('$method $url rejects a request without a token', async (route) => {
    const res = await t.app.inject(route);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(reader.loadCalls).toEqual([]);
  });

  it.each(TEACHER_ONLY_ROUTES)('$method $url rejects a voided token', async (route) => {
    const old = await signIn('code-a');
    await signIn('code-b');
    const res = await t.app.inject({ ...route, headers: { authorization: `Bearer ${old}` } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(reader.loadCalls).toEqual([]);
  });
});
