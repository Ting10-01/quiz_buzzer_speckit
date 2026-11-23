import type { OAuth2Client } from 'google-auth-library';
import type { GoogleOAuthGateway, GoogleSignIn, GoogleTokens } from '../../src/auth/GoogleOAuthGateway.js';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const ALL_SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email', DRIVE_FILE_SCOPE];

// A Google sign-in with per-account fake token values, so tests can tell accounts apart
// and search logs for them.
export function signInFor(email: string, grantedScopes: string[] = ALL_SCOPES): GoogleSignIn {
  return {
    email,
    grantedScopes,
    tokens: {
      accessToken: `ya29.fake-access-${email}`,
      refreshToken: `1//fake-refresh-${email}`,
      expiryDate: Date.now() + 3600_000,
    },
  };
}

// Shaped like the GaxiosError google-auth-library throws when Google rejects a grant.
export function invalidGrantError(): Error {
  return Object.assign(new Error('invalid_grant'), {
    status: 400,
    response: { status: 400, data: { error: 'invalid_grant' } },
  });
}

export class FakeOAuthClient {
  getAccessTokenCalls = 0;
  refreshCount = 0;
  private failure: Error | null = null;

  constructor(readonly tokens: GoogleTokens) {}

  // Makes every later getAccessToken() reject with `error`.
  failWith(error: Error): void {
    this.failure = error;
  }

  // Mimics OAuth2Client: an expired access token is refreshed with the refresh token.
  async getAccessToken(): Promise<{ token: string }> {
    this.getAccessTokenCalls++;
    if (this.failure) throw this.failure;
    if (this.tokens.expiryDate <= Date.now()) {
      this.refreshCount++;
      this.tokens.accessToken = `ya29.fake-refreshed-${this.refreshCount}`;
      this.tokens.expiryDate = Date.now() + 3600_000;
    }
    return { token: this.tokens.accessToken };
  }
}

export class FakeGoogleGateway implements GoogleOAuthGateway {
  readonly clients: FakeOAuthClient[] = [];
  readonly exchangedCodes: string[] = [];
  private readonly outcomes = new Map<string, GoogleSignIn | Error>();
  private readonly holds = new Map<string, Promise<void>>();

  // `code` exchanges to `outcome`: a sign-in, or an error to throw. Unknown codes throw invalid_grant.
  set(code: string, outcome: GoogleSignIn | Error): this {
    this.outcomes.set(code, outcome);
    return this;
  }

  // The next exchanges of `code` wait until the returned function is called.
  hold(code: string): () => void {
    let release!: () => void;
    this.holds.set(code, new Promise<void>((resolve) => (release = resolve)));
    return () => {
      this.holds.delete(code);
      release();
    };
  }

  async exchangeCode(code: string): Promise<GoogleSignIn> {
    this.exchangedCodes.push(code);
    await this.holds.get(code);
    const outcome = this.outcomes.get(code) ?? invalidGrantError();
    if (outcome instanceof Error) throw outcome;
    return { ...outcome, tokens: { ...outcome.tokens } };
  }

  createClient(tokens: GoogleTokens): OAuth2Client {
    const client = new FakeOAuthClient({ ...tokens });
    this.clients.push(client);
    return client as unknown as OAuth2Client;
  }

  get lastClient(): FakeOAuthClient | undefined {
    return this.clients.at(-1);
  }
}
