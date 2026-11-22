import { act, screen } from '@testing-library/react';
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
  const view = renderWithRegistry(<JoinPage navigate={vi.fn()} />, registry);
  return { view, unsubscribe, notify: (a: Activity) => act(() => notify(a)) };
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
});
