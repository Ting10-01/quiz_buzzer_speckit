import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthLibraryGateway } from '../../src/auth/GoogleAuthLibraryGateway.js';
import { GoogleUnavailableError } from '../../src/auth/GoogleOAuthGateway.js';
import { TEST_GOOGLE_CONFIG } from '../helpers/testApp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('GoogleAuthLibraryGateway', () => {
  it('gives up with GoogleUnavailableError after 15 seconds without an answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const silentFetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const gateway = new GoogleAuthLibraryGateway(TEST_GOOGLE_CONFIG, { fetchImplementation: silentFetch });

    let settled: unknown = 'pending';
    const exchange = gateway.exchangeCode('some-code').catch((error: unknown) => error);
    void exchange.then((result) => (settled = result));

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await exchange).toBeInstanceOf(GoogleUnavailableError);
  });

  it('turns a network error into GoogleUnavailableError', async () => {
    const failingFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const gateway = new GoogleAuthLibraryGateway(TEST_GOOGLE_CONFIG, { fetchImplementation: failingFetch, retry: false });
    await expect(gateway.exchangeCode('some-code')).rejects.toBeInstanceOf(GoogleUnavailableError);
  });
});
