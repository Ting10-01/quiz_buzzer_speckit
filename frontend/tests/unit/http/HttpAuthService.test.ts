import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../../src/services/http/ApiClient';
import type { GoogleCodeResult, GoogleIdentityClient } from '../../../src/services/http/GoogleIdentityClient';
import { HttpAuthService } from '../../../src/services/http/HttpAuthService';
import { TeacherCredentialStore } from '../../../src/services/http/TeacherCredentialStore';

const ACCOUNT = { name: 'teacher', email: 'teacher@example.com' };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

/** Routes fake fetch calls by "METHOD path". */
function fakeServer(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
    const route = routes[`${init.method} ${path}`];
    if (!route) throw new Error(`unexpected ${init.method} ${path}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function fakeGoogle(result: GoogleCodeResult): GoogleIdentityClient & { requestCode: ReturnType<typeof vi.fn> } {
  return { requestCode: vi.fn().mockResolvedValue(result) };
}

describe('HttpAuthService', () => {
  let store: TeacherCredentialStore;

  beforeEach(() => {
    store = new TeacherCredentialStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  function service(google: GoogleIdentityClient) {
    return new HttpAuthService(google, new ApiClient(store), store);
  }

  describe('signInWithGoogle', () => {
    it('stores the credential and returns the account on success (AC-01)', async () => {
      const fetchMock = fakeServer({
        'GET /api/auth/config': () => json(200, { clientId: 'client-1' }),
        'POST /api/auth/google': () => json(200, { ok: true, teacherToken: 'token-a', account: ACCOUNT }),
      });
      const google = fakeGoogle({ code: 'code-1' });
      await expect(service(google).signInWithGoogle()).resolves.toEqual({ ok: true, account: ACCOUNT });
      expect(store.get()).toBe('token-a');
      expect(google.requestCode).toHaveBeenCalledWith('client-1', [
        'openid',
        'email',
        'https://www.googleapis.com/auth/drive.file',
      ]);
      const post = fetchMock.mock.calls.find(([, init]) => init.method === 'POST')!;
      expect(JSON.parse(post[1].body as string)).toEqual({ code: 'code-1' });
    });

    it('returns CANCELLED without calling the sign-in route (AC-03)', async () => {
      const fetchMock = fakeServer({ 'GET /api/auth/config': () => json(200, { clientId: 'client-1' }) });
      await expect(service(fakeGoogle({ error: 'CANCELLED' })).signInWithGoogle()).resolves.toEqual({
        ok: false,
        failure: 'CANCELLED',
      });
      expect(fetchMock.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false);
    });

    it('turns SCOPE_DENIED into a sign-in failure and keeps the tab credential (AC-04)', async () => {
      fakeServer({
        'GET /api/auth/config': () => json(200, { clientId: 'client-1' }),
        'POST /api/auth/google': () => json(200, { ok: false, failure: 'SCOPE_DENIED' }),
      });
      store.set('old-token');
      await expect(service(fakeGoogle({ code: 'code-1' })).signInWithGoogle()).resolves.toEqual({
        ok: false,
        failure: 'SCOPE_DENIED',
      });
      expect(store.get()).toBe('old-token');
    });

    it('replaces the tab credential when signing in again in the same tab (T038)', async () => {
      let token = 'token-a';
      fakeServer({
        'GET /api/auth/config': () => json(200, { clientId: 'client-1' }),
        'POST /api/auth/google': () => json(200, { ok: true, teacherToken: token, account: ACCOUNT }),
      });
      const auth = service(fakeGoogle({ code: 'code-1' }));
      await auth.signInWithGoogle();
      token = 'token-b';
      await auth.signInWithGoogle();
      expect(store.get()).toBe('token-b');
    });

    it('returns the same promise and opens Google once while signing in (edge: double click)', async () => {
      fakeServer({
        'GET /api/auth/config': () => json(200, { clientId: 'client-1' }),
        'POST /api/auth/google': () => json(200, { ok: true, teacherToken: 'token-a', account: ACCOUNT }),
      });
      const google = fakeGoogle({ code: 'code-1' });
      const auth = service(google);
      const first = auth.signInWithGoogle();
      const second = auth.signInWithGoogle();
      expect(second).toBe(first);
      await first;
      expect(google.requestCode).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentAccount', () => {
    it('returns null without calling the server when the tab has no credential', async () => {
      const fetchMock = fakeServer({});
      await expect(service(fakeGoogle({})).getCurrentAccount()).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the account from /api/auth/me (REQ-AUTH-11)', async () => {
      fakeServer({ 'GET /api/auth/me': () => json(200, ACCOUNT) });
      store.set('token-a');
      await expect(service(fakeGoogle({})).getCurrentAccount()).resolves.toEqual(ACCOUNT);
    });

    it('rejects "sign in again" and clears the credential once it was replaced (AC-08)', async () => {
      fakeServer({ 'GET /api/auth/me': () => json(401, { code: 'UNAUTHORIZED', message: '需要老師登入' }) });
      store.set('token-a');
      await expect(service(fakeGoogle({})).getCurrentAccount()).rejects.toMatchObject({
        message: '老師登入已失效，請回首頁重新登入',
      });
      expect(store.get()).toBeNull();
    });
  });
});
