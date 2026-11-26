import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import type { ActivityService, AuthService } from '../../src/services/interfaces';
import { TeacherLoginPage } from '../../src/pages/teacher/TeacherLoginPage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity } from '../helpers/fixtures';

const SIGNED_IN = { ok: true, account: { name: 'T', email: 't@example.com' } };

/** No activity unless a test says otherwise (US1 AC-3, FR-015). */
function setup(
  signInWithGoogle: AuthService['signInWithGoogle'],
  getCurrentActivity: ActivityService['getCurrentActivity'] = vi.fn().mockResolvedValue(null),
) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({
    auth: { signInWithGoogle },
    activity: { getCurrentActivity },
  });
  renderWithRegistry(<TeacherLoginPage navigate={navigate} />, registry);
  return { navigate, registry, login: () => userEvent.click(screen.getByRole('button', { name: '用 Google 登入' })) };
}

describe('TeacherLoginPage (T-Login)', () => {
  it('offers only "用 Google 登入" as a sign-in option (FR-012)', () => {
    setup(vi.fn());
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.filter((label) => label?.includes('登入'))).toEqual(['用 Google 登入']);
  });

  it('goes to T-Pick when sign-in succeeds (US1 AC-3)', async () => {
    const { navigate, login } = setup(
      vi.fn().mockResolvedValue({ ok: true, account: { name: 'T', email: 't@example.com' } }),
    );
    await login();
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Pick' });
  });

  it('stays and shows "已取消登入" when sign-in is cancelled (edge, US1 AC-4, FR-013)', async () => {
    const { navigate, login } = setup(vi.fn().mockResolvedValue({ ok: false, failure: 'CANCELLED' }));
    await login();
    expect(await screen.findByText('已取消登入')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays and asks for spreadsheet access when the scope was denied (002 SCOPE_DENIED)', async () => {
    const { navigate, login } = setup(vi.fn().mockResolvedValue({ ok: false, failure: 'SCOPE_DENIED' }));
    await login();
    expect(await screen.findByText('需要存取雲端硬碟才能讀取學習單。請再按一次「用 Google 登入」，並在 Google 的畫面勾選雲端硬碟檔案那一項。')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows an unexpected error, stays, and clears it on the next success (FR-009)', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce({ message: '模擬：連不上伺服器' })
      .mockResolvedValueOnce({ ok: false, failure: 'CANCELLED' });
    const { navigate, login } = setup(signIn);
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
    await login();
    await screen.findByText('已取消登入');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('"搶答板" goes home without a service call (FR-007)', async () => {
    const signIn = vi.fn();
    const { navigate } = setup(signIn);
    await userEvent.click(screen.getByRole('button', { name: '搶答板' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'Main' });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('"返回首頁" goes home without a service call (FR-007, US1 AC-6)', async () => {
    const signIn = vi.fn();
    const { navigate, registry } = setup(signIn);
    await userEvent.click(screen.getByRole('button', { name: '返回首頁' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'Main' });
    expect(signIn).not.toHaveBeenCalled();
    expect(registry.auth.getCurrentAccount).not.toHaveBeenCalled();
  });

  describe('destination after sign-in follows the current activity (FR-015, D21)', () => {
    it.each<[Activity['phase'], Partial<Activity>, string]>([
      ['PREPARING', {}, 'T-Lobby'],
      ['OPEN', { currentQuestion: 2 }, 'T-Live'],
      ['QUESTION_ENDED', { currentQuestion: 2 }, 'T-QuestionEnd'],
      ['FINISHED', { currentQuestion: 4 }, 'T-Results'],
    ])('goes to the page for %s with the returned activity (US1 AC-8, T18–T21)', async (phase, extra, id) => {
      const activity = makeActivity({ phase, ...extra });
      const { navigate, login } = setup(
        vi.fn().mockResolvedValue(SIGNED_IN),
        vi.fn().mockResolvedValue(activity),
      );
      await login();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith({ id, activity });
    });

    it('goes to T-Pick when there is no activity, asking only after sign-in succeeds (US1 AC-3)', async () => {
      const signIn = vi.fn().mockResolvedValue(SIGNED_IN);
      const getCurrentActivity = vi.fn().mockResolvedValue(null);
      const { navigate, login } = setup(signIn, getCurrentActivity);
      expect(getCurrentActivity).not.toHaveBeenCalled();
      await login();
      expect(getCurrentActivity).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith({ id: 'T-Pick' });
    });

    it('does not ask for the activity when sign-in fails (FR-013)', async () => {
      const getCurrentActivity = vi.fn().mockResolvedValue(makeActivity());
      const { navigate, login } = setup(
        vi.fn().mockResolvedValue({ ok: false, failure: 'CANCELLED' }),
        getCurrentActivity,
      );
      await login();
      await screen.findByText('已取消登入');
      expect(getCurrentActivity).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('stays and shows the error when the activity cannot be loaded, then retries (US1 AC-9, FR-009)', async () => {
      const activity = makeActivity({ phase: 'OPEN', currentQuestion: 2 });
      const getCurrentActivity = vi
        .fn()
        .mockRejectedValueOnce({ message: '連不上伺服器' })
        .mockResolvedValueOnce(activity);
      const { navigate, login } = setup(vi.fn().mockResolvedValue(SIGNED_IN), getCurrentActivity);
      await login();
      expect(await screen.findByRole('alert')).toHaveTextContent('連不上伺服器');
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '用 Google 登入' })).toBeInTheDocument();
      await login();
      expect(navigate).toHaveBeenCalledWith({ id: 'T-Live', activity });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
