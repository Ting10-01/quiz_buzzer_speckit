import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { ConsolePage } from '../../src/pages/teacher/ConsolePage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity, makeGroups, makeMixedQuestions } from '../helpers/fixtures';

function setup(activity: Activity = makeActivity({ questions: makeMixedQuestions() })) {
  const navigate = vi.fn();
  let notify: (next: Activity) => void = () => {};
  const unsubscribe = vi.fn();
  const registry = createFakeRegistry({
    activity: {
      onActivityChange: vi.fn((listener: (next: Activity) => void) => {
        notify = listener;
        return unsubscribe;
      }),
    },
  });
  const view = renderWithRegistry(
    <ConsolePage navigate={navigate} page={{ id: 'T-Lobby', activity }} />,
    registry,
  );
  return {
    navigate,
    registry,
    unsubscribe,
    view,
    notify: (next: Activity) => act(() => notify(next)),
  };
}

const groupItem = (number: number) =>
  within(screen.getByRole('list', { name: '組別' }))
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(`第 ${number} 組`));

describe('ConsolePage (T-Lobby) display (FR-025, US2 AC-8)', () => {
  it('shows the joined member count of every group from the passed Activity', () => {
    setup();
    expect(within(screen.getByRole('list', { name: '組別' })).getAllByRole('listitem')).toHaveLength(3);
    expect(groupItem(1)).toHaveTextContent('已加入 3 人');
    expect(groupItem(2)).toHaveTextContent('已加入 2 人');
  });

  it('marks the groups nobody has joined yet (edge)', () => {
    setup();
    expect(groupItem(3)).toHaveTextContent('還沒有人');
  });

  it('lists the questions of this round with number and type', () => {
    setup();
    const list = screen.getByRole('list', { name: '這一輪的題目' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('第 1 題');
    expect(items[0]).toHaveTextContent('題組・2 小題');
    expect(items[2]).toHaveTextContent('第 3 題');
    expect(items[2]).toHaveTextContent('單題');
  });

  it('does not call getCurrentActivity (C-1)', () => {
    const { registry } = setup();
    expect(registry.activity.getCurrentActivity).not.toHaveBeenCalled();
  });

  it('offers "開放第 1 題" and none of the removed design elements (SC-004)', () => {
    setup();
    expect(screen.getByRole('button', { name: '開放第 1 題' })).toBeInTheDocument();
    expect(screen.queryByText(/複製網址|localhost|分頁|離線|限時/)).not.toBeInTheDocument();
  });
});

describe('ConsolePage (T-Lobby) updates and buttons', () => {
  it('subscribes to onActivityChange and replaces the member counts with the snapshot', () => {
    const { registry, notify } = setup();
    expect(registry.activity.onActivityChange).toHaveBeenCalledTimes(1);
    notify(makeActivity({ questions: makeMixedQuestions(), groups: makeGroups([1, 0, 4]) }));
    expect(groupItem(1)).toHaveTextContent('已加入 1 人');
    expect(groupItem(2)).toHaveTextContent('還沒有人');
    expect(groupItem(3)).toHaveTextContent('已加入 4 人');
  });

  it('unsubscribes when unmounted', () => {
    const { unsubscribe, view } = setup();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('"修改設定" goes to T-Setup in edit mode with the activity and no service call (US2 AC-10)', async () => {
    const activity = makeActivity({ questions: makeMixedQuestions() });
    const { navigate, registry } = setup(activity);
    await userEvent.click(screen.getByRole('button', { name: '修改設定' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Setup', mode: 'edit', activity });
    expect(registry.activity.updateSettings).not.toHaveBeenCalled();
    expect(registry.activity.openQuestion).not.toHaveBeenCalled();
  });

  it('"修改設定" after a notification uses the latest snapshot', async () => {
    const { navigate, notify } = setup();
    const latest = makeActivity({ questions: makeMixedQuestions(), groups: makeGroups([1, 1, 1]) });
    notify(latest);
    await userEvent.click(screen.getByRole('button', { name: '修改設定' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Setup', mode: 'edit', activity: latest });
  });
});
