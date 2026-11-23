import { describe, expect, it, vi } from 'vitest';
import { GoogleClientProvider } from '../../src/auth/GoogleClientProvider.js';
import { TeacherAuth } from '../../src/auth/TeacherAuth.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';

const A = 'teacher.a@example.com';
const NO_DRIVE_SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email'];

function setup() {
  const gateway = new FakeGoogleGateway()
    .set('code-a', signInFor(A))
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
    expect(replace).toHaveBeenCalledExactlyOnceWith(signInFor(A).tokens);
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
