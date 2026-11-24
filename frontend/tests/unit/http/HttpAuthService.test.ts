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

  describe('signInWithGoogle errors', () => {
    const config = () => json(200, { clientId: 'client-1' });

    it('rejects when the browser blocked the Google popup (AC-24)', async () => {
      fakeServer({ 'GET /api/auth/config': config });
      await expect(service(fakeGoogle({ error: 'POPUP_BLOCKED' })).signInWithGoogle()).rejects.toMatchObject({
        message: '瀏覽器擋住了 Google 登入視窗，請允許彈出視窗後再試',
      });
    });

    it('rejects when the Google sign-in script cannot load', async () => {
      fakeServer({ 'GET /api/auth/config': config });
      await expect(service(fakeGoogle({ error: 'LOAD_FAILED' })).signInWithGoogle()).rejects.toMatchObject({
        message: '無法載入 Google 登入，請確認網路連線',
      });
    });

    it.each([
      [503, 'GOOGLE_NOT_CONFIGURED', '伺服器尚未設定 Google 登入，請參考 README 設定環境變數', 'GET /api/auth/config'],
      [502, 'GOOGLE_UNAVAILABLE', '連不上 Google，請稍後再試', 'POST /api/auth/google'],
      [400, 'INVALID_CODE', 'Google 登入未完成，請再試一次', 'POST /api/auth/google'],
    ])('rejects %i %s with the server message (AC-21, AC-22)', async (status, code, message, failing) => {
      fakeServer({
        'GET /api/auth/config': config,
        'POST /api/auth/google': () => json(200, { ok: true, teacherToken: 't', account: ACCOUNT }),
        [failing]: () => json(status, { code, message }),
      });
      await expect(service(fakeGoogle({ code: 'code-1' })).signInWithGoogle()).rejects.toMatchObject({
        status,
        code,
        message,
      });
      expect(store.get()).toBeNull();
    });

    it('rejects "server unreachable" when fetch fails (AC-23)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      await expect(service(fakeGoogle({ code: 'code-1' })).signInWithGoogle()).rejects.toMatchObject({
        message: '連不上伺服器，請確認伺服器已啟動',
      });
    });

    it('lets the teacher try again after a failed sign-in', async () => {
      fakeServer({ 'GET /api/auth/config': config });
      const google = fakeGoogle({ error: 'POPUP_BLOCKED' });
      const auth = service(google);
      await auth.signInWithGoogle().catch(() => undefined);
      await auth.signInWithGoogle().catch(() => undefined);
      expect(google.requestCode).toHaveBeenCalledTimes(2);
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
