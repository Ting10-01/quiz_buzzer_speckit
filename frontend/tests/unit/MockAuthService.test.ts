import { describe, expect, it, vi } from 'vitest';
import { SignInFailure } from '@quiz-buzzer/shared/entities';
import { MockAuthService } from '../../src/services/mock/MockAuthService';
import { ACCOUNT_CHOICE, MockFixtures } from '../../src/services/mock/MockFixtures';
import { MockSession } from '../../src/services/mock/MockSession';

function setup(choice: string | null) {
  const session = new MockSession();
  session.onRequest(() => session.answer(choice));
  return { session, auth: new MockAuthService(session) };
}

describe('MockAuthService (M1, M9)', () => {
  it('offers only the teacher account and cancel (M1)', async () => {
    const session = new MockSession();
    const listener = vi.fn(() => session.answer(ACCOUNT_CHOICE.CANCEL));
    session.onRequest(listener);
    await new MockAuthService(session).signInWithGoogle();
    expect(listener).toHaveBeenCalledWith({
      title: '模擬帳號選擇',
      options: [
        { id: ACCOUNT_CHOICE.TEACHER, label: '模擬老師帳號' },
        { id: ACCOUNT_CHOICE.CANCEL, label: '取消' },
      ],
    });
  });

  it('signs in with the mock teacher account', async () => {
    const { auth } = setup(ACCOUNT_CHOICE.TEACHER);
    await expect(auth.getCurrentAccount()).resolves.toBeNull();
    await expect(auth.signInWithGoogle()).resolves.toEqual({
      ok: true,
      account: MockFixtures.teacherAccount,
    });
    await expect(auth.getCurrentAccount()).resolves.toEqual(MockFixtures.teacherAccount);
  });

  it('fails with CANCELLED for cancel or closing the chooser (edge)', async () => {
    await expect(setup(ACCOUNT_CHOICE.CANCEL).auth.signInWithGoogle()).resolves.toEqual({
      ok: false,
      failure: SignInFailure.CANCELLED,
    });
    await expect(setup(null).auth.signInWithGoogle()).resolves.toEqual({
      ok: false,
      failure: SignInFailure.CANCELLED,
    });
  });

  it('rejects once after failNextCall without prompting (edge)', async () => {
    const session = new MockSession();
    const listener = vi.fn(() => session.answer(ACCOUNT_CHOICE.TEACHER));
    session.onRequest(listener);
    const auth = new MockAuthService(session);
    session.failNextCall();
    await expect(auth.signInWithGoogle()).rejects.toEqual({ message: '模擬：連不上伺服器' });
    expect(listener).not.toHaveBeenCalled();
    await expect(auth.signInWithGoogle()).resolves.toMatchObject({ ok: true });
  });
});
