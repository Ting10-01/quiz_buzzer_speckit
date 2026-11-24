// AuthService over the 002 HTTP API; conversion rules in contracts/auth-http.md "前端如何轉換".
import {
  SignInFailure,
  type SignInResult,
  type TeacherAccount,
  type UnexpectedError,
} from '@quiz-buzzer/shared/entities';
import type { AuthService } from '../interfaces';
import type { ApiClient } from './ApiClient';
import { GoogleCodeError, type GoogleIdentityClient } from './GoogleIdentityClient';
import type { TeacherCredentialStore } from './TeacherCredentialStore';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];

type SignInResponse =
  | { ok: true; teacherToken: string; account: TeacherAccount }
  | { ok: false; failure: SignInFailure };

export class HttpAuthService implements AuthService {
  /** The sign-in in progress; a second click gets the same promise (spec Edge Cases). */
  private signingIn: Promise<SignInResult> | null = null;

  constructor(
    private readonly google: GoogleIdentityClient,
    private readonly api: ApiClient,
    private readonly credentials: TeacherCredentialStore,
  ) {}

  signInWithGoogle(): Promise<SignInResult> {
    this.signingIn ??= this.signIn().finally(() => {
      this.signingIn = null;
    });
    return this.signingIn;
  }

  async getCurrentAccount(): Promise<TeacherAccount | null> {
    if (!this.credentials.get()) return null;
    return this.api.request<TeacherAccount>('GET', '/api/auth/me');
  }

  private async signIn(): Promise<SignInResult> {
    const { clientId } = await this.api.request<{ clientId: string }>('GET', '/api/auth/config');
    const { code, error } = await this.google.requestCode(clientId, SCOPES);
    if (error === GoogleCodeError.CANCELLED) return { ok: false, failure: SignInFailure.CANCELLED };
    if (!code) throw { message: '無法開啟 Google 登入，請再試一次' } satisfies UnexpectedError;

    const response = await this.api.request<SignInResponse>('POST', '/api/auth/google', { code });
    if (!response.ok) return { ok: false, failure: response.failure };
    this.credentials.set(response.teacherToken);
    return { ok: true, account: response.account };
  }
}
