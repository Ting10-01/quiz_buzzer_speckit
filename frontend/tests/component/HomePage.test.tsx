import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { HomePage } from '../../src/pages/HomePage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity, makeGroups } from '../helpers/fixtures';

function setup(current: Activity | null) {
  let notify: (activity: Activity) => void = () => {};
  const unsubscribe = vi.fn();
  const registry = createFakeRegistry({
    activity: {
      getCurrentActivity: vi.fn().mockResolvedValue(current),
      onPhaseChange: vi.fn((listener) => {
        notify = listener;
        return unsubscribe;
      }),
    },
  });
  const navigate = vi.fn();
  const view = renderWithRegistry(<HomePage navigate={navigate} />, registry);
  return { registry, navigate, unsubscribe, view, notify: (a: Activity) => act(() => notify(a)) };
}

function serviceCallCount(registry: ReturnType<typeof createFakeRegistry>) {
  return Object.values(registry)
    .filter((service) => typeof service === 'object')
    .flatMap((service) => Object.values(service as object))
    .reduce((sum, fn) => sum + ((fn as ReturnType<typeof vi.fn>).mock?.calls.length ?? 0), 0);
}

describe('HomePage (Main)', () => {
  it('"我是老師" goes to T-Login and "我是學生" to S-Join without service calls (US1 AC-1, AC-2)', async () => {
    const { registry, navigate } = setup(null);
    await screen.findByText('目前沒有活動');
    const before = serviceCallCount(registry);
    await userEvent.click(screen.getByRole('button', { name: /我是老師/ }));
    expect(navigate).toHaveBeenLastCalledWith({ id: 'T-Login' });
    await userEvent.click(screen.getByRole('button', { name: /我是學生/ }));
    expect(navigate).toHaveBeenLastCalledWith({ id: 'S-Join' });
    expect(serviceCallCount(registry)).toBe(before);
  });

  it('shows "目前沒有活動" when there is no activity (FR-010, edge)', async () => {
    setup(null);
    expect(await screen.findByText('目前沒有活動')).toBeInTheDocument();
  });

  it('shows phase, question count and group count but no activity name (FR-010)', async () => {
    setup(makeActivity({ groups: makeGroups([1, 1, 1, 1, 1, 1]) }));
    expect(await screen.findByText('準備中')).toBeInTheDocument();
    expect(screen.getByText('4 題 · 6 組')).toBeInTheDocument();
    expect(screen.queryByText(/Sample Sheet Title/)).not.toBeInTheDocument();
  });

  it('updates when onPhaseChange notifies (H2), and unsubscribes on unmount', async () => {
    const { notify, unsubscribe, view } = setup(null);
    await screen.findByText('目前沒有活動');
    notify(makeActivity({ phase: 'OPEN', currentQuestion: 2 }));
    expect(screen.getByText('搶答中')).toBeInTheDocument();
    expect(screen.queryByText('目前沒有活動')).not.toBeInTheDocument();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('shows an unexpected error in the error area (FR-009)', async () => {
    const registry = createFakeRegistry({
      activity: { getCurrentActivity: vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' }) },
    });
    renderWithRegistry(<HomePage navigate={vi.fn()} />, registry);
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
  });
});
