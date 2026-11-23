import { randomBytes, timingSafeEqual } from 'node:crypto';
import { SignInFailure, type TeacherAccount } from '../temp-shared/entities.js';
import type { GoogleClientProvider } from './GoogleClientProvider.js';
import type { GoogleOAuthGateway } from './GoogleOAuthGateway.js';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface TeacherBinding {
  account: TeacherAccount;
  teacherToken: string;
}

export interface SignInOutcome {
  ok: boolean;
  teacherToken?: string;
  account?: TeacherAccount;
  failure?: SignInFailure;
}

export interface AuthLog {
  info(obj: object, msg: string): void;
}

// The single authority on who the teacher is (data-model 4). Whoever signs in with Google and
// grants drive.file becomes the teacher and replaces the previous one; there is no account check.
// Memory only, and never touches activity state (REQ-AUTH-03).
export class TeacherAuth {
  private binding: TeacherBinding | null = null;
  private readonly rotateListeners: (() => void)[] = [];

  constructor(
    private readonly gateway: GoogleOAuthGateway,
    private readonly googleClients: GoogleClientProvider,
    private readonly log: AuthLog,
  ) {}

  async signIn(code: string): Promise<SignInOutcome> {
    const signIn = await this.gateway.exchangeCode(code);
    // No `await` from here on: the token and the Google authorization change together, so
    // concurrent sign-ins end with both belonging to whichever finished last (AC-27).
    const replaced = this.binding !== null;

    if (!signIn.grantedScopes.includes(DRIVE_FILE_SCOPE)) {
      this.logSignIn('SCOPE_DENIED', signIn.email, false);
      return { ok: false, failure: SignInFailure.SCOPE_DENIED };
    }

    const account: TeacherAccount = { name: signIn.email.split('@')[0] ?? signIn.email, email: signIn.email };
    const teacherToken = randomBytes(32).toString('base64url');
    this.googleClients.replace(signIn.tokens);
    this.binding = { account, teacherToken };
    if (replaced) for (const listener of this.rotateListeners) listener();
    this.logSignIn('OK', signIn.email, replaced);
    return { ok: true, teacherToken, account };
  }

  verify(token: string): boolean {
    if (!this.binding) return false;
    const given = Buffer.from(token);
    const expected = Buffer.from(this.binding.teacherToken);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  currentAccount(): TeacherAccount | null {
    return this.binding?.account ?? null;
  }

  // Called when a sign-in replaces an existing teacher, e.g. to drop the old teacher's sockets.
  onRotate(listener: () => void): void {
    this.rotateListeners.push(listener);
  }

  private logSignIn(result: 'OK' | 'SCOPE_DENIED', email: string, replaced: boolean): void {
    this.log.info({ event: 'auth.signIn', result, email, replaced }, 'teacher sign-in');
  }
}
