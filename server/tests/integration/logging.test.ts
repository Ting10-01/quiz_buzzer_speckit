import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInFor } from '../helpers/fakeGoogleGateway.js';
import { createTestApp, TEST_GOOGLE_CONFIG, type TestApp } from '../helpers/testApp.js';

const NO_DRIVE_SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email'];
const CODES = {
  a: 'code-secret-value-account-a',
  b: 'code-secret-value-account-b',
  noDrive: 'code-secret-value-no-drive',
};
const SIGN_INS = {
  a: signInFor('teacher.a@example.com'),
  b: signInFor('teacher.b@example.com'),
  noDrive: signInFor('no.drive@example.com', NO_DRIVE_SCOPES),
};

let t: TestApp;

async function signIn(code: string) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/google',
    headers: { 'x-requested-with': 'XmlHttpRequest' },
    payload: { code },
  });
  return res.json() as { teacherToken?: string };
}

beforeEach(async () => {
  t = await createTestApp();
  t.gateway.set(CODES.a, SIGN_INS.a).set(CODES.b, SIGN_INS.b).set(CODES.noDrive, SIGN_INS.noDrive);
});

afterEach(async () => {
  await t.app.close();
});

describe('logs', () => {
  it('contain no code, token, client secret or API key after a full sign-in flow', async () => {
    const first = await signIn(CODES.a);
    const again = await signIn(CODES.a);
    const other = await signIn(CODES.b);
    await signIn(CODES.noDrive);
    await t.app.inject({ url: '/api/auth/me', headers: { authorization: `Bearer ${first.teacherToken}` } });
    const picker = await t.app.inject({
      url: '/api/auth/picker-token',
      headers: { authorization: `Bearer ${other.teacherToken}` },
    });
    expect(picker.statusCode).toBe(200);

    const secrets = [
      ...Object.values(CODES),
      ...Object.values(SIGN_INS).flatMap((s) => [s.tokens.accessToken, s.tokens.refreshToken]),
      first.teacherToken!,
      again.teacherToken!,
      other.teacherToken!,
      TEST_GOOGLE_CONFIG.clientSecret,
      TEST_GOOGLE_CONFIG.apiKey,
    ];
    expect(t.logs.lines.length).toBeGreaterThan(0);
    for (const secret of secrets) expect(t.logs.text).not.toContain(secret);
  });

  it('show the authorization header as [Redacted]', async () => {
    await t.app.inject({ url: '/api/auth/me', headers: { authorization: 'Bearer some-wrong-token', cookie: 'a=b' } });

    const request = t.logs.parsed().find((line) => line.msg === 'incoming request') as
      | { req: { headers: Record<string, string> } }
      | undefined;
    expect(request?.req.headers.authorization).toBe('[Redacted]');
    expect(request?.req.headers.cookie).toBe('[Redacted]');
    expect(t.logs.text).not.toContain('some-wrong-token');
  });

  it('record auth.signIn events with result, email and replaced', async () => {
    await signIn(CODES.a);
    await signIn(CODES.b);
    await signIn(CODES.noDrive);

    const events = t.logs.parsed().filter((line) => line.event === 'auth.signIn');
    expect(events.map(({ result, email, replaced }) => ({ result, email, replaced }))).toEqual([
      { result: 'OK', email: 'teacher.a@example.com', replaced: false },
      { result: 'OK', email: 'teacher.b@example.com', replaced: true },
      { result: 'SCOPE_DENIED', email: 'no.drive@example.com', replaced: false },
    ]);
  });
});
