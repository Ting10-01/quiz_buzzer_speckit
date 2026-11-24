// Opens the Google sign-in popup and returns an authorization code (002 research RD-10).
// HttpAuthService depends on this interface so unit tests replace Google with a fake.

export const GoogleCodeError = {
  CANCELLED: 'CANCELLED',
  POPUP_BLOCKED: 'POPUP_BLOCKED',
  LOAD_FAILED: 'LOAD_FAILED',
} as const;
export type GoogleCodeError = (typeof GoogleCodeError)[keyof typeof GoogleCodeError];

/** Exactly one of `code` and `error` is set. */
export interface GoogleCodeResult {
  code?: string;
  error?: GoogleCodeError;
}

export interface GoogleIdentityClient {
  requestCode(clientId: string, scopes: string[]): Promise<GoogleCodeResult>;
}
