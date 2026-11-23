import { describe, expect, it, vi } from 'vitest';
import { GoogleClientProvider } from '../../src/auth/GoogleClientProvider.js';
import { TeacherAuth } from '../../src/auth/TeacherAuth.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';

const A = 'teacher.a@example.com';
const B = 'teacher.b@example.com';
const SIGN_IN_A = signInFor(A);
const SIGN_IN_B = signInFor(B);
const NO_DRIVE_SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email'];

function setup() {
  const gateway = new FakeGoogleGateway()
    .set('code-a', SIGN_IN_A)
    .set('code-b', SIGN_IN_B)
    .set('code-no-drive', signInFor('no.drive@example.com', NO_DRIVE_SCOPES));
  const clients = new GoogleClientProvider(gateway);
  const replace = vi.spyOn(clients, 'replace');
  const log = { info: vi.fn() };
  const auth = new TeacherAuth(gateway, clients, log);
  return { gateway, clients, replace, log, auth };
}

describe('TeacherAuth sign-in', () => {
  it('makes the first account that signs in the teacher', async () => {
    const { auth, replace } = setup();
    const outcome = await auth.signIn('code-a');

    expect(outcome.ok).toBe(true);
    expect(outcome.teacherToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(outcome.account).toEqual({ name: 'teacher.a', email: A });
    expect(auth.currentAccount()).toEqual({ name: 'teacher.a', email: A });
    expect(auth.verify(outcome.teacherToken!)).toBe(true);
    expect(replace).toHaveBeenCalledExactlyOnceWith(SIGN_IN_A.tokens);
  });

  it('rejects wrong tokens, including ones of a different length', async () => {
    const { auth } = setup();
    const { teacherToken } = await auth.signIn('code-a');

    expect(auth.verify('')).toBe(false);
    expect(auth.verify('short')).toBe(false);
    expect(auth.verify(teacherToken!.slice(0, -1) + (teacherToken!.endsWith('A') ? 'B' : 'A'))).toBe(false);
  });

  it('has no teacher and verifies nothing before anyone signs in', () => {
    const { auth } = setup();
    expect(auth.currentAccount()).toBeNull();
    expect(auth.verify('anything')).toBe(false);
  });

  it('returns SCOPE_DENIED without drive.file and keeps having no teacher', async () => {
    const { auth, replace } = setup();
    const outcome = await auth.signIn('code-no-drive');

    expect(outcome).toEqual({ ok: false, failure: 'SCOPE_DENIED' });
    expect(auth.currentAccount()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('returns SCOPE_DENIED without drive.file and keeps the current teacher', async () => {
    const { auth, replace } = setup();
    const first = await auth.signIn('code-a');
    replace.mockClear();

    const outcome = await auth.signIn('code-no-drive');

    expect(outcome).toEqual({ ok: false, failure: 'SCOPE_DENIED' });
    expect(auth.verify(first.teacherToken!)).toBe(true);
    expect(auth.currentAccount()).toEqual({ name: 'teacher.a', email: A });
    expect(replace).not.toHaveBeenCalled();
  });

  it('logs auth.signIn without tokens', async () => {
    const { auth, log } = setup();
    const { teacherToken } = await auth.signIn('code-a');
    await auth.signIn('code-no-drive');

    expect(log.info).toHaveBeenCalledWith(
      { event: 'auth.signIn', result: 'OK', email: A, replaced: false },
      expect.any(String),
    );
    expect(log.info).toHaveBeenCalledWith(
      { event: 'auth.signIn', result: 'SCOPE_DENIED', email: 'no.drive@example.com', replaced: false },
      expect.any(String),
    );
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(teacherToken);
  });

  it('lets gateway errors propagate without changing the teacher', async () => {
    const { auth } = setup();
    const first = await auth.signIn('code-a');

    await expect(auth.signIn('unknown-code')).rejects.toThrow('invalid_grant');
    expect(auth.verify(first.teacherToken!)).toBe(true);
  });
});

describe('TeacherAuth replacing the teacher', () => {
  it.each([
    ['the same account signs in again', 'code-a', A, SIGN_IN_A],
    ['another account signs in', 'code-b', B, SIGN_IN_B],
  ])('when %s, issues a new token and voids the old one', async (_name, code, email, signIn) => {
    const { auth, replace } = setup();
    const rotate = vi.fn();
    auth.onRotate(rotate);
    const first = await auth.signIn('code-a');
    expect(rotate).not.toHaveBeenCalled();
    replace.mockClear();

    const second = await auth.signIn(code);

    expect(second.ok).toBe(true);
    expect(second.teacherToken).not.toBe(first.teacherToken);
    expect(auth.verify(first.teacherToken!)).toBe(false);
    expect(auth.verify(second.teacherToken!)).toBe(true);
    expect(auth.currentAccount()?.email).toBe(email);
    expect(replace).toHaveBeenCalledExactlyOnceWith(signIn.tokens);
    expect(rotate).toHaveBeenCalledOnce();
  });

  it('logs that the previous teacher was replaced', async () => {
    const { auth, log } = setup();
    await auth.signIn('code-a');
    await auth.signIn('code-b');
    expect(log.info).toHaveBeenLastCalledWith(
      { event: 'auth.signIn', result: 'OK', email: B, replaced: true },
      expect.any(String),
    );
  });

  it('does not notify onRotate for SCOPE_DENIED', async () => {
    const { auth } = setup();
    const rotate = vi.fn();
    auth.onRotate(rotate);
    await auth.signIn('code-a');
    await auth.signIn('code-no-drive');
    expect(rotate).not.toHaveBeenCalled();
  });

  it('keeps exactly one valid token, matching the last authorization, under concurrent sign-ins', async () => {
    const { auth, gateway, replace } = setup();
    for (let i = 0; i < 100; i++) {
      const releaseA = gateway.hold('code-a');
      const releaseB = gateway.hold('code-b');
      const pendingA = auth.signIn('code-a');
      const pendingB = auth.signIn('code-b');
      const [first, second] = Math.random() < 0.5 ? [releaseA, releaseB] : [releaseB, releaseA];
      first();
      if (Math.random() < 0.5) await new Promise((resolve) => setImmediate(resolve));
      second();
      const [a, b] = await Promise.all([pendingA, pendingB]);

      const validA = auth.verify(a.teacherToken!);
      const validB = auth.verify(b.teacherToken!);
      expect(Number(validA) + Number(validB)).toBe(1);
      const holder = validA ? A : B;
      expect(auth.currentAccount()?.email).toBe(holder);
      expect(replace.mock.lastCall?.[0].refreshToken).toBe(signInFor(holder).tokens.refreshToken);
    }
  });

  it('has no teacher in a new instance (server restart)', async () => {
    const { auth, gateway, clients } = setup();
    const { teacherToken } = await auth.signIn('code-a');
    const restarted = new TeacherAuth(gateway, clients, { info: vi.fn() });
    expect(restarted.currentAccount()).toBeNull();
    expect(restarted.verify(teacherToken!)).toBe(false);
  });
});
