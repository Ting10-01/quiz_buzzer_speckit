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

const POPUP_ERROR_MESSAGE: Record<Exclude<GoogleCodeError, 'CANCELLED'>, string> = {
  [GoogleCodeError.POPUP_BLOCKED]: '瀏覽器擋住了 Google 登入視窗，請允許彈出視窗後再試',
  [GoogleCodeError.LOAD_FAILED]: '無法載入 Google 登入，請確認網路連線',
};

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
    if (error || !code) {
      throw { message: POPUP_ERROR_MESSAGE[error ?? GoogleCodeError.LOAD_FAILED] } satisfies UnexpectedError;
    }

    const response = await this.api.request<SignInResponse>('POST', '/api/auth/google', { code });
    if (!response.ok) return { ok: false, failure: response.failure };
    this.credentials.set(response.teacherToken);
    return { ok: true, account: response.account };
  }
}
