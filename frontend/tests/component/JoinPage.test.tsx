import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { JoinPage } from '../../src/pages/student/JoinPage';
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
  const view = renderWithRegistry(<JoinPage navigate={navigate} />, registry);
  return { view, registry, navigate, unsubscribe, notify: (a: Activity) => act(() => notify(a)) };
}

describe('JoinPage (S-Join) display', () => {
  it('shows "no activity" and no groups when there is none (FR-050, edge)', async () => {
    setup(null);
    expect(await screen.findByText('目前沒有活動，請等老師建立活動')).toBeInTheDocument();
    expect(screen.queryByText(/第 \d+ 組/)).not.toBeInTheDocument();
  });

  it('lists every group with its joined member count', async () => {
    setup(makeActivity({ groups: makeGroups([3, 2, 0]) }));
    expect(await screen.findByText('第 1 組')).toBeInTheDocument();
    expect(screen.getByText('第 2 組')).toBeInTheDocument();
    expect(screen.getByText('第 3 組')).toBeInTheDocument();
    expect(screen.getByText('已加入 3 人')).toBeInTheDocument();
    expect(screen.getByText('已加入 2 人')).toBeInTheDocument();
    expect(screen.getByText('還沒有人')).toBeInTheDocument();
    expect(screen.queryByText(/Sample Sheet Title/)).not.toBeInTheDocument();
  });

  it('switches from no activity to the group list when PREPARING is notified (S3)', async () => {
    const { notify, view, unsubscribe } = setup(null);
    await screen.findByText('目前沒有活動，請等老師建立活動');
    notify(makeActivity({ groups: makeGroups([1, 1]) }));
    expect(screen.getByText('第 2 組')).toBeInTheDocument();
    expect(screen.queryByText('目前沒有活動，請等老師建立活動')).not.toBeInTheDocument();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  describe('返回首頁 (FR-007, US1 AC-6)', () => {
    it.each([
      ['with an activity', makeActivity()],
      ['without an activity (edge)', null],
    ])('goes home without a further service call %s', async (_, current) => {
      const { registry, navigate } = setup(current);
      await screen.findByText(current ? '第 1 組' : '目前沒有活動，請等老師建立活動');
      vi.mocked(registry.activity.getCurrentActivity).mockClear();
      await userEvent.click(screen.getByRole('button', { name: '返回首頁' }));
      expect(navigate).toHaveBeenCalledWith({ id: 'Main' });
      expect(registry.activity.getCurrentActivity).not.toHaveBeenCalled();
      expect(registry.activity.joinGroup).not.toHaveBeenCalled();
      expect(registry.activity.leaveGroup).not.toHaveBeenCalled();
    });
  });
});
