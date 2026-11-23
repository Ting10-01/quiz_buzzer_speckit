import type { OAuth2Client } from 'google-auth-library';
import { httpStatusOf, isInvalidGrant, type GoogleOAuthGateway, type GoogleTokens } from './GoogleOAuthGateway.js';

// No teacher has signed in, so there is no Google authorization to use.
export class TeacherNotSignedInError extends Error {
  readonly code = 'NOT_SIGNED_IN';
  constructor() {
    super('No teacher has signed in');
    this.name = 'TeacherNotSignedInError';
  }
}

// Holds the current teacher's Google authorization, in memory only (research RD-04).
// 003, 006: call authorizedClient() before every Google call; never keep the returned client.
export class GoogleClientProvider {
  private client: OAuth2Client | null = null;

  constructor(private readonly gateway: GoogleOAuthGateway) {}

  replace(tokens: GoogleTokens): void {
    this.client = this.gateway.createClient(tokens);
  }

  authorizedClient(): OAuth2Client {
    if (!this.client) throw new TeacherNotSignedInError();
    return this.client;
  }
}

// The teacher's Google authorization no longer works (revoked or expired refresh token): the
// teacher must sign in again. 003, 006: answer 401 GOOGLE_AUTH_EXPIRED when this is true.
export function isGoogleAuthExpired(error: unknown): boolean {
  return isInvalidGrant(error) || httpStatusOf(error) === 401;
}
