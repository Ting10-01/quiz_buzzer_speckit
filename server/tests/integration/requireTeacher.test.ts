import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInFor } from '../helpers/fakeGoogleGateway.js';
import { createTestApp, type TestApp } from '../helpers/testApp.js';

const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: '需要老師登入' };

let t: TestApp;
let counter: number;

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
  t = await createTestApp({
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
