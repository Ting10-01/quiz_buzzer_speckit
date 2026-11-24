import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppRouter } from '../../src/app/AppRouter';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';

// T097: with every service replaced by a real implementation (isMockMode false, no mock
// controls), the "模擬模式" label and the control bar appear 0 times (SC-003, FR-005).
// Student pages sit in the centred phone-width column (spec Assumptions).

function renderRouter(isMockMode: boolean) {
  const registry = createFakeRegistry({
    isMockMode,
    activity: { getCurrentActivity: vi.fn().mockResolvedValue(null) },
  });
  return renderWithRegistry(<AppRouter />, registry);
}

const onHome = () => screen.findByRole('heading', { name: '課堂搶答' });

describe('AppRouter without mock services (SC-003, FR-005)', () => {
  it('shows no mock label or control bar on Main, T-Login and S-Join', async () => {
    renderRouter(false);
    await onHome();
    const expectNoMock = () => {
      expect(screen.queryAllByText('模擬模式')).toHaveLength(0);
      expect(screen.queryAllByRole('group', { name: '模擬控制列' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: /^模擬：/ })).toHaveLength(0);
    };
    expectNoMock();

    await userEvent.click(screen.getByRole('button', { name: /我是老師/ }));
    await screen.findByRole('heading', { name: '老師登入' });
    expectNoMock();

    await userEvent.click(screen.getByRole('button', { name: '返回首頁' }));
    await onHome();
    await userEvent.click(screen.getByRole('button', { name: /我是學生/ }));
    await screen.findByText('目前沒有活動，請等老師建立活動');
    expectNoMock();
  });

  it('shows the mock label when mock mode is on', async () => {
    renderRouter(true);
    await onHome();
    expect(screen.getAllByText('模擬模式')).toHaveLength(1);
  });
});

describe('AppRouter student column (spec Assumptions)', () => {
  it('wraps student pages in the centred column and leaves teacher pages unwrapped', async () => {
    renderRouter(false);
    await onHome();
    expect(screen.queryByTestId('student-column')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /我是學生/ }));
    await screen.findByText('目前沒有活動，請等老師建立活動');
    expect(screen.getByTestId('student-column')).toContainElement(
      screen.getByText('目前沒有活動，請等老師建立活動'),
    );

    await userEvent.click(screen.getByRole('button', { name: '返回首頁' }));
    await onHome();
    await userEvent.click(screen.getByRole('button', { name: /我是老師/ }));
    await screen.findByRole('heading', { name: '老師登入' });
    expect(screen.queryByTestId('student-column')).toBeNull();
  });
});
