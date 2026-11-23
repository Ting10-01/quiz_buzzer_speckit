import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInFor } from '../helpers/fakeGoogleGateway.js';
import { createTestApp, TEST_GOOGLE_CONFIG, type TestApp } from '../helpers/testApp.js';

const A = 'teacher.a@example.com';
const B = 'teacher.b@example.com';
const NO_DRIVE_SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email'];
const XRW = { 'x-requested-with': 'XmlHttpRequest' };

function postGoogle(app: FastifyInstance, code: unknown, headers: Record<string, string> = XRW) {
  return app.inject({ method: 'POST', url: '/api/auth/google', headers, payload: { code } });
}

function getMe(app: FastifyInstance, token?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
  t.gateway.set('code-a', signInFor(A)).set('code-b', signInFor(B)).set('code-no-drive', signInFor('no.drive@example.com', NO_DRIVE_SCOPES));
});

afterEach(async () => {
  await t.app.close();
});

describe('authRoutes sign-in', () => {
  it('GET /api/auth/config returns the client id only', async () => {
    const res = await t.app.inject('/api/auth/config');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ clientId: TEST_GOOGLE_CONFIG.clientId });
  });

  it('POST /api/auth/google signs in and returns the teacher token and account', async () => {
    const res = await postGoogle(t.app, 'code-a');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ ok: true, teacherToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), account: { name: 'teacher.a', email: A } });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 200 SCOPE_DENIED when drive.file was not granted', async () => {
    const res = await postGoogle(t.app, 'code-no-drive');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: false, failure: 'SCOPE_DENIED' });
  });

  it('rejects a request without X-Requested-With', async () => {
    const res = await postGoogle(t.app, 'code-a', {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'BAD_REQUEST', message: '登入請求格式錯誤' });
    expect(t.gateway.exchangedCodes).toEqual([]);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 123],
    ['longer than 2048', 'x'.repeat(2049)],
  ])('rejects a code that is %s', async (_name, code) => {
    const res = await postGoogle(t.app, code);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'BAD_REQUEST', message: '登入請求格式錯誤' });
    expect(t.gateway.exchangedCodes).toEqual([]);
  });

  it('accepts a code of exactly 2048 characters', async () => {
    const code = 'y'.repeat(2048);
    t.gateway.set(code, signInFor(A));
    expect((await postGoogle(t.app, code)).statusCode).toBe(200);
  });

  it('returns 400 INVALID_CODE when Google rejects the code', async () => {
    const res = await postGoogle(t.app, 'code-google-rejects');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'INVALID_CODE', message: 'Google 登入未完成，請再試一次' });
  });

  it('GET /api/auth/me returns the teacher account for a valid token', async () => {
    const { teacherToken } = (await postGoogle(t.app, 'code-a')).json();
    const res = await getMe(t.app, teacherToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'teacher.a', email: A });
  });

  it('never answers NOT_TEACHER', async () => {
    const bodies = [
      (await postGoogle(t.app, 'code-a')).body,
      (await postGoogle(t.app, 'code-no-drive')).body,
      (await postGoogle(t.app, 'code-google-rejects')).body,
    ];
    expect(bodies.join()).not.toContain('NOT_TEACHER');
  });
});

describe('authRoutes replacing the teacher', () => {
  it.each([
    ['the same account', 'code-a', { name: 'teacher.a', email: A }],
    ['another account', 'code-b', { name: 'teacher.b', email: B }],
  ])('voids the old token when %s signs in again', async (_name, code, account) => {
    const oldToken = (await postGoogle(t.app, 'code-a')).json().teacherToken;
    const newToken = (await postGoogle(t.app, code)).json().teacherToken;

    const oldRes = await getMe(t.app, oldToken);
    expect(oldRes.statusCode).toBe(401);
    expect(oldRes.json()).toEqual({ code: 'UNAUTHORIZED', message: '需要老師登入' });

    const newRes = await getMe(t.app, newToken);
    expect(newRes.statusCode).toBe(200);
    expect(newRes.json()).toEqual(account);
  });
});
