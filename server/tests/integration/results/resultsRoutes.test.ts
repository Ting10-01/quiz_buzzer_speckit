import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resultsRoutes } from '../../../src/results/resultsRoutes.js';
import { WriteBackFailure } from '../../../src/results/WriteBackService.js';
import type { WriteBackResult } from '../../../src/temp-shared/entities.js';
import { signInFor } from '../../helpers/fakeGoogleGateway.js';
import { createTestApp, type TestApp } from '../../helpers/testApp.js';

const URL = '/api/results/write-back';

let t: TestApp;
const writeBack = vi.fn<() => Promise<WriteBackResult>>();

async function signIn(code: string): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/google',
    headers: { 'x-requested-with': 'XmlHttpRequest' },
    payload: { code },
  });
  return res.json().teacherToken;
}

async function post(token: string) {
  return t.app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` } });
}

beforeEach(async () => {
  writeBack.mockReset();
  // A fake WriteBackService: buildApp registers the real one only once 004 and 005 exist.
  t = await createTestApp({ beforeReady: (app) => app.register(resultsRoutes, { writeBack: { writeBack } }) });
  t.gateway.set('code-a', signInFor('teacher.a@example.com')).set('code-b', signInFor('teacher.b@example.com'));
});

afterEach(async () => {
  await t.app.close();
});

describe('POST /api/results/write-back', () => {
  it('answers 200 with the WriteBackResult', async () => {
    writeBack.mockResolvedValue({ ok: true, cellCount: 6 });
    const res = await post(await signIn('code-a'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, cellCount: 6 });
    expect(writeBack).toHaveBeenCalledTimes(1);
  });

  it('answers 200 with ok: false and the reason for an expected failure', async () => {
    writeBack.mockRejectedValue(new WriteBackFailure('LAYOUT_CHANGED', 3));
    const res = await post(await signIn('code-a'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: false,
      cellCount: 0,
      failureReason: '第 3 題的位置和匯入時不同（例如插入或刪除了列），請把學習單改回匯入時的版面後再寫回。沒有寫入任何格子。',
    });
  });

  it('answers 401 GOOGLE_AUTH_EXPIRED as an ErrorBody', async () => {
    writeBack.mockRejectedValue(new WriteBackFailure('GOOGLE_AUTH_EXPIRED'));
    const res = await post(await signIn('code-a'));
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      code: 'GOOGLE_AUTH_EXPIRED',
      message: 'Google 授權已失效，請回首頁重新登入後再寫回。沒有寫入任何格子。',
    });
  });

  it('answers 500 for an unexpected error', async () => {
    writeBack.mockRejectedValue(new Error('bug'));
    const res = await post(await signIn('code-a'));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ code: 'INTERNAL', message: '伺服器發生錯誤，請稍後再試' });
  });
});

describe('POST /api/results/write-back without a valid teacher token (AC-27, REQ-RES-15)', () => {
  it.each([
    ['no Authorization header', async () => ({})],
    ['a wrong token', async () => ({ authorization: `Bearer ${'x'.repeat(43)}` })],
    [
      'a token voided by a newer sign-in',
      async () => {
        const old = await signIn('code-a');
        await signIn('code-b');
        return { authorization: `Bearer ${old}` };
      },
    ],
  ])('answers 401 UNAUTHORIZED for %s and does not write back', async (_name, headers) => {
    const res = await t.app.inject({ method: 'POST', url: URL, headers: await headers() });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: 'UNAUTHORIZED', message: '需要老師登入' });
    expect(writeBack).not.toHaveBeenCalled();
  });
});
