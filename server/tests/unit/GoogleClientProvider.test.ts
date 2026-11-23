import { describe, expect, it } from 'vitest';
import { GoogleAuthLibraryGateway } from '../../src/auth/GoogleAuthLibraryGateway.js';
import { GoogleClientProvider, isGoogleAuthExpired, TeacherNotSignedInError } from '../../src/auth/GoogleClientProvider.js';
import { GoogleUnavailableError } from '../../src/auth/GoogleOAuthGateway.js';
import { FakeGoogleGateway, FakeOAuthClient, invalidGrantError } from '../helpers/fakeGoogleGateway.js';
import { TEST_GOOGLE_CONFIG } from '../helpers/testApp.js';

const expiredTokens = () => ({ accessToken: 'old-access', refreshToken: 'the-refresh', expiryDate: Date.now() - 1000 });

describe('GoogleClientProvider', () => {
  it('throws TeacherNotSignedInError before any teacher signed in', () => {
    const provider = new GoogleClientProvider(new FakeGoogleGateway());
    expect(() => provider.authorizedClient()).toThrow(TeacherNotSignedInError);
    try {
      provider.authorizedClient();
    } catch (error) {
      expect((error as TeacherNotSignedInError).code).toBe('NOT_SIGNED_IN');
    }
  });

  it('returns a client holding the refresh token that refreshes an expired access token', async () => {
    const gateway = new FakeGoogleGateway();
    const provider = new GoogleClientProvider(gateway);
    provider.replace(expiredTokens());

    const client = provider.authorizedClient() as unknown as FakeOAuthClient;
    expect(client).toBe(gateway.lastClient);
    expect(client.tokens.refreshToken).toBe('the-refresh');
    const { token } = await client.getAccessToken();
    expect(client.refreshCount).toBe(1);
    expect(token).not.toBe('old-access');
  });

  it('returns the client of the latest replace', () => {
    const gateway = new FakeGoogleGateway();
    const provider = new GoogleClientProvider(gateway);
    provider.replace(expiredTokens());
    provider.replace({ ...expiredTokens(), refreshToken: 'second-refresh' });
    expect((provider.authorizedClient() as unknown as FakeOAuthClient).tokens.refreshToken).toBe('second-refresh');
  });

  it('with the real library, refreshes an expired access token using the refresh token', async () => {
    const requests: string[] = [];
    const fetchImplementation = (async (_url: string, init?: RequestInit) => {
      requests.push(String(init?.body));
      return new Response(JSON.stringify({ access_token: 'refreshed-access', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const provider = new GoogleClientProvider(new GoogleAuthLibraryGateway(TEST_GOOGLE_CONFIG, { fetchImplementation }));
    provider.replace(expiredTokens());

    const client = provider.authorizedClient();
    expect(client.credentials.refresh_token).toBe('the-refresh');
    expect((await client.getAccessToken()).token).toBe('refreshed-access');
    expect(requests.join()).toContain('grant_type=refresh_token');
  });
});

describe('isGoogleAuthExpired', () => {
  it('is true for invalid_grant', () => {
    expect(isGoogleAuthExpired(invalidGrantError())).toBe(true);
  });

  it('is true for the error the real library throws when the refresh token was revoked', async () => {
    const fetchImplementation = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const gateway = new GoogleAuthLibraryGateway(TEST_GOOGLE_CONFIG, { fetchImplementation });
    const error = await gateway.createClient(expiredTokens()).getAccessToken().catch((e: unknown) => e);
    expect(isGoogleAuthExpired(error)).toBe(true);
  });

  it('is true when Google answers 401', () => {
    expect(isGoogleAuthExpired(Object.assign(new Error('Unauthorized'), { response: { status: 401, data: {} } }))).toBe(true);
  });

  it('is false for a timeout or other errors', () => {
    expect(isGoogleAuthExpired(new GoogleUnavailableError())).toBe(false);
    expect(isGoogleAuthExpired(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
    expect(isGoogleAuthExpired(Object.assign(new Error('Forbidden'), { response: { status: 403, data: {} } }))).toBe(false);
    expect(isGoogleAuthExpired(null)).toBe(false);
  });
});
