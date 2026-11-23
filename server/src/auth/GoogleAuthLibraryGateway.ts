import { OAuth2Client, type OAuth2ClientOptions } from 'google-auth-library';
import type { GoogleConfig } from '../config.js';
import {
  GoogleUnavailableError,
  isGoogleUnreachable,
  type GoogleOAuthGateway,
  type GoogleSignIn,
  type GoogleTokens,
} from './GoogleOAuthGateway.js';

export const GOOGLE_TIMEOUT_MS = 15_000;

// Exchanges a Google Identity Services popup code on the server (research RD-01, RD-11).
export class GoogleAuthLibraryGateway implements GoogleOAuthGateway {
  constructor(
    private readonly config: GoogleConfig,
    // Lets tests replace the HTTP transport; production uses the library default.
    private readonly transporterOptions: OAuth2ClientOptions['transporterOptions'] = {},
  ) {}

  exchangeCode(code: string): Promise<GoogleSignIn> {
    return withTimeout(this.exchange(code), GOOGLE_TIMEOUT_MS);
  }

  createClient(tokens: GoogleTokens): OAuth2Client {
    const client = this.newClient();
    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });
    return client;
  }

  private newClient(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      transporterOptions: { timeout: GOOGLE_TIMEOUT_MS, ...this.transporterOptions },
    });
  }

  private async exchange(code: string): Promise<GoogleSignIn> {
    const client = this.newClient();
    try {
      const { tokens } = await client.getToken({ code, redirect_uri: 'postmessage' });
      // With prompt=consent Google always returns these; anything missing is treated as Google failing.
      if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
        throw new GoogleUnavailableError('Google returned incomplete tokens');
      }
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.clientId });
      const email = ticket.getPayload()?.email;
      if (!email) throw new GoogleUnavailableError('Google returned no email');
      return {
        email,
        grantedScopes: (tokens.scope ?? '').split(' ').filter(Boolean),
        tokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date ?? Date.now(),
        },
      };
    } catch (error) {
      // No HTTP answer (network error, abort) or a Google server error: Google is unavailable.
      // 4xx answers such as invalid_grant are passed on for the route to map.
      if (error instanceof GoogleUnavailableError) throw error;
      throw isGoogleUnreachable(error) ? new GoogleUnavailableError() : error;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GoogleUnavailableError('Google did not answer in time')), ms);
  });
  promise.catch(() => {}); // the late result of a timed-out exchange is ignored
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
