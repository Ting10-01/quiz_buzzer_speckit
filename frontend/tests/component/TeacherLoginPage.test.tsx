import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../../src/services/interfaces';
import { TeacherLoginPage } from '../../src/pages/teacher/TeacherLoginPage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';

function setup(signInWithGoogle: AuthService['signInWithGoogle']) {
  const navigate = vi.fn();
  renderWithRegistry(
    <TeacherLoginPage navigate={navigate} />,
    createFakeRegistry({ auth: { signInWithGoogle } }),
  );
  return { navigate, login: () => userEvent.click(screen.getByRole('button', { name: '用 Google 登入' })) };
}

describe('TeacherLoginPage (T-Login)', () => {
  it('offers only "用 Google 登入" as a sign-in option (FR-012)', () => {
    setup(vi.fn());
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['搶答板', '用 Google 登入']);
  });

  it('goes to T-Pick when sign-in succeeds (US1 AC-3)', async () => {
    const { navigate, login } = setup(
      vi.fn().mockResolvedValue({ ok: true, account: { name: 'T', email: 't@example.com' } }),
    );
    await login();
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Pick' });
  });

  it.each([
    ['CANCELLED', '已取消登入'],
    ['NOT_TEACHER', '此帳號不是老師帳號'],
  ])('stays and shows the %s failure message (edge, US1 AC-4, AC-5)', async (failure, text) => {
    const { navigate, login } = setup(vi.fn().mockResolvedValue({ ok: false, failure }));
    await login();
    expect(await screen.findByText(text)).toBeInTheDocument();
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
});
