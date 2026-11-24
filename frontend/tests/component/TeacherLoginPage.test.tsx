import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../../src/services/interfaces';
import { TeacherLoginPage } from '../../src/pages/teacher/TeacherLoginPage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';

function setup(signInWithGoogle: AuthService['signInWithGoogle']) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({ auth: { signInWithGoogle } });
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
});
