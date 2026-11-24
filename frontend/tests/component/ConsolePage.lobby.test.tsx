import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import type { ActivityService } from '../../src/services/interfaces';
import { ConsolePage } from '../../src/pages/teacher/ConsolePage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity, makeGroups, makeMixedQuestions } from '../helpers/fixtures';

function setup(
  activity: Activity = makeActivity({ questions: makeMixedQuestions() }),
  services: Partial<ActivityService> = {},
) {
  const navigate = vi.fn();
  let notify: (next: Activity) => void = () => {};
  const unsubscribe = vi.fn();
  const registry = createFakeRegistry({
    activity: {
      onActivityChange: vi.fn((listener: (next: Activity) => void) => {
        notify = listener;
        return unsubscribe;
      }),
      ...services,
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

/** The left and right sides of the bottom action bar (ActionBar: bar > inner > two sides). */
function actionBarSides(container: HTMLElement) {
  const bar = container.querySelector('[data-action-bar]');
  if (!bar) throw new Error('action bar not found');
  const sides = Array.from(bar.querySelectorAll(':scope > div > div')) as HTMLElement[];
  expect(sides).toHaveLength(2);
  const names = (side: HTMLElement) =>
    within(side)
      .queryAllByRole('button')
      .map((button) => button.textContent);
  return { left: names(sides[0]), right: names(sides[1]) };
}

const cancelDialog = () => screen.queryByRole('dialog', { name: /取消活動/ });

describe('ConsolePage (T-Lobby) cancel activity (FR-026, US2 AC-11, AC-12)', () => {
  it('puts only "取消活動" on the left and "修改設定", "開放第 1 題" on the right (RD-09)', () => {
    const { view } = setup();
    expect(actionBarSides(view.container)).toEqual({
      left: ['取消活動'],
      right: ['修改設定', '開放第 1 題'],
    });
  });

  it('"取消活動" opens the confirm dialog saying joined students go back to S-Join, without a service call (US2 AC-11)', async () => {
    const { registry } = setup();
    expect(cancelDialog()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '取消活動' }));
    const dialog = cancelDialog();
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/學生/);
    expect(dialog).toHaveTextContent(/選組頁/);
    expect(within(dialog!).getByRole('button', { name: '繼續準備' })).toBeInTheDocument();
    expect(within(dialog!).getByRole('button', { name: '確定取消活動' })).toBeInTheDocument();
    expect(registry.activity.cancelActivity).not.toHaveBeenCalled();
  });

  it('"繼續準備" closes the dialog and stays on T-Lobby without cancelling (US2 AC-11)', async () => {
    const { navigate, registry } = setup();
    await userEvent.click(screen.getByRole('button', { name: '取消活動' }));
    await userEvent.click(screen.getByRole('button', { name: '繼續準備' }));
    expect(cancelDialog()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開放第 1 題' })).toBeInTheDocument();
    expect(registry.activity.cancelActivity).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('"確定取消活動" calls cancelActivity once and goes to T-Pick (US2 AC-12)', async () => {
    const cancelActivity = vi.fn().mockResolvedValue(undefined);
    const { navigate } = setup(undefined, { cancelActivity });
    await userEvent.click(screen.getByRole('button', { name: '取消活動' }));
    await userEvent.click(screen.getByRole('button', { name: '確定取消活動' }));
    expect(cancelActivity).toHaveBeenCalledTimes(1);
    expect(cancelActivity).toHaveBeenCalledWith();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Pick' });
  });

  it('stays on T-Lobby and shows an unexpected error in ErrorArea after closing the dialog (edge, FR-009)', async () => {
    const cancelActivity = vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' });
    const { navigate } = setup(undefined, { cancelActivity });
    await userEvent.click(screen.getByRole('button', { name: '取消活動' }));
    await userEvent.click(screen.getByRole('button', { name: '確定取消活動' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(cancelDialog()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開放第 1 題' })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
