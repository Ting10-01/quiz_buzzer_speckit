import type { OAuth2Client } from 'google-auth-library';

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

export interface GoogleSignIn {
  email: string;
  grantedScopes: string[];
  tokens: GoogleTokens;
}

// Boundary to Google OAuth. The only production implementation is GoogleAuthLibraryGateway;
// the interface exists so tests can substitute Google (constitution VIII).
export interface GoogleOAuthGateway {
  exchangeCode(code: string): Promise<GoogleSignIn>;
  createClient(tokens: GoogleTokens): OAuth2Client;
}

// Google did not answer in time or could not be reached.
export class GoogleUnavailableError extends Error {
  readonly code = 'GOOGLE_UNAVAILABLE';
  constructor(message = 'Google is unavailable') {
    super(message);
    this.name = 'GoogleUnavailableError';
  }
}

// HTTP status of an error thrown by google-auth-library (GaxiosError), if Google answered at all.
export function httpStatusOf(error: unknown): number | undefined {
  const e = error as { status?: unknown; response?: { status?: unknown } } | null;
  const status = e?.response?.status ?? e?.status;
  return typeof status === 'number' ? status : undefined;
}

// Google refused the grant: a stale or reused code, or a revoked refresh token.
export function isInvalidGrant(error: unknown): boolean {
  const e = error as { response?: { data?: { error?: unknown } } } | null;
  return e?.response?.data?.error === 'invalid_grant';
}
