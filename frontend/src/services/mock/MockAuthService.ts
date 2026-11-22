// M1: mock Google sign-in through the mock account chooser.
import { SignInFailure, type SignInResult, type TeacherAccount } from '@quiz-buzzer/shared/entities';
import type { AuthService } from '../interfaces';
import { ACCOUNT_CHOICE, MockFixtures } from './MockFixtures';
import { MOCK_UNEXPECTED_ERROR, type MockSession } from './MockSession';

export class MockAuthService implements AuthService {
  private account: TeacherAccount | null = null;

  constructor(private readonly session: MockSession) {}

  async signInWithGoogle(): Promise<SignInResult> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    const choice = await this.session.requestChoice({
      title: '模擬帳號選擇',
      options: [
        { id: ACCOUNT_CHOICE.TEACHER, label: '模擬老師帳號' },
        { id: ACCOUNT_CHOICE.CANCEL, label: '取消' },
      ],
    });
    if (choice === ACCOUNT_CHOICE.TEACHER) {
      this.account = { ...MockFixtures.teacherAccount };
      return { ok: true, account: { ...this.account } };
    }
    // "Cancel" and closing the chooser both count as a cancelled sign-in.
    return { ok: false, failure: SignInFailure.CANCELLED };
  }

  async getCurrentAccount(): Promise<TeacherAccount | null> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.account ? { ...this.account } : null;
  }
}
