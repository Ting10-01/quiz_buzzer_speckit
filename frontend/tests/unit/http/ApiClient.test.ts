import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../../../src/services/http/ApiClient';
import { TeacherCredentialStore } from '../../../src/services/http/TeacherCredentialStore';

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('ApiClient', () => {
  let store: TeacherCredentialStore;
  let client: ApiClient;

  beforeEach(() => {
    store = new TeacherCredentialStore();
    client = new ApiClient(store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('sends the Bearer credential when the tab has one', async () => {
    const fetchMock = respond(200, { ok: 1 });
    vi.stubGlobal('fetch', fetchMock);
    store.set('token-a');
    await client.request('GET', '/api/auth/me');
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/auth/me');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer token-a');
  });

  it('sends no Authorization header without a credential and posts JSON', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.request('POST', '/api/auth/google', { code: 'c' })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ code: 'c' }));
  });

  it('rejects an error response with ApiError carrying the server message', async () => {
    vi.stubGlobal('fetch', respond(502, { code: 'GOOGLE_UNAVAILABLE', message: '連不上 Google，請稍後再試' }));
    const error = await client.request('GET', '/api/auth/config').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'GOOGLE_UNAVAILABLE', message: '連不上 Google，請稍後再試' });
  });

  it('turns 401 UNAUTHORIZED into "sign in again" and clears the tab credential', async () => {
    vi.stubGlobal('fetch', respond(401, { code: 'UNAUTHORIZED', message: '需要老師登入' }));
    store.set('old-token');
    await expect(client.request('GET', '/api/auth/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: '老師登入已失效，請回首頁重新登入',
    });
    expect(store.get()).toBeNull();
  });

  it('keeps the credential on 401 GOOGLE_AUTH_EXPIRED and passes the server message on', async () => {
    vi.stubGlobal(
      'fetch',
      respond(401, { code: 'GOOGLE_AUTH_EXPIRED', message: 'Google 授權已失效，請回首頁重新登入' }),
    );
    store.set('token-a');
    await expect(client.request('GET', '/api/auth/picker-token')).rejects.toMatchObject({
      code: 'GOOGLE_AUTH_EXPIRED',
      message: 'Google 授權已失效，請回首頁重新登入',
    });
    expect(store.get()).toBe('token-a');
  });

  it('rejects with NETWORK when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client.request('GET', '/api/auth/config')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      message: '連不上伺服器，請確認伺服器已啟動',
    });
  });
});
