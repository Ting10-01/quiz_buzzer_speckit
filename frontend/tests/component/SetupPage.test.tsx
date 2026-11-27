import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import {
  GROUP_COUNT_DEFAULT,
  GROUP_COUNT_MAX,
  GROUP_COUNT_MIN,
  JOIN_METHOD_TEXT,
} from '@quiz-buzzer/shared/activityRules';
import { SetupPage } from '../../src/pages/teacher/SetupPage';
import type { ActivityService } from '../../src/services/interfaces';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity, makeGroups, makeImportSuccess } from '../helpers/fixtures';

const VALIDATION = { field: 'groupCount', message: '模擬：驗證失敗' };
const UNEXPECTED = { message: '模擬：連不上伺服器' };

function renderCreate(activity: Partial<ActivityService> = {}) {
  const navigate = vi.fn();
  const result = makeImportSuccess();
  const registry = createFakeRegistry({ activity });
  renderWithRegistry(
    <SetupPage navigate={navigate} page={{ id: 'T-Setup', mode: 'create', result }} />,
    registry,
  );
  return { navigate, registry, result };
}

function renderEdit(current: Activity, activity: Partial<ActivityService> = {}) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({ activity });
  renderWithRegistry(
    <SetupPage navigate={navigate} page={{ id: 'T-Setup', mode: 'edit', activity: current }} />,
    registry,
  );
  return { navigate, registry };
}

/** The group count field: the count, "−", "+", the group list and its validation message. */
const groupField = () => screen.getByRole('group', { name: '組數' });
const groupCount = () => within(groupField()).getAllByRole('listitem').length;
const minus = () => within(groupField()).getByRole('button', { name: '−' });
const plus = () => within(groupField()).getByRole('button', { name: '+' });

/** The text of one entry in the "這一輪" summary, found by its term. */
function summaryEntry(term: string) {
  const summary = screen.getByRole('region', { name: '這一輪' });
  const dt = within(summary).getByText(term, { selector: 'dt' });
  return dt.nextElementSibling?.textContent;
}

async function clickTimes(button: () => HTMLElement, times: number) {
  for (let i = 0; i < times; i += 1) await userEvent.click(button());
}

function expectNoServiceCall(activity: ActivityService) {
  expect(activity.createActivity).not.toHaveBeenCalled();
  expect(activity.updateSettings).not.toHaveBeenCalled();
}

describe('SetupPage (T-Setup) fields (FR-023)', () => {
  it('has no activity name field and none of the removed design elements (SC-004)', () => {
    renderCreate();
    expect(screen.queryByText(/活動名稱/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/公平模式|限時|複製網址|localhost/)).not.toBeInTheDocument();
  });

  it('"+" and "−" change the count by one and update the group list, without a service call or page change (US2 AC-7)', async () => {
    const { navigate, registry } = renderCreate();
    const initial = groupCount();
    expect(within(groupField()).getByText(`${initial} 組`)).toBeInTheDocument();

    await userEvent.click(plus());
    expect(groupCount()).toBe(initial + 1);
    expect(within(groupField()).getByText(`${initial + 1} 組`)).toBeInTheDocument();
    expect(within(groupField()).getByText(`第 ${initial + 1} 組`)).toBeInTheDocument();

    await userEvent.click(minus());
    await userEvent.click(minus());
    expect(groupCount()).toBe(initial - 1);
    expect(within(groupField()).queryByText(`第 ${initial} 組`)).not.toBeInTheDocument();

    expect(navigate).not.toHaveBeenCalled();
    expectNoServiceCall(registry.activity);
  });

  it('shows the round summary with question count, group question numbers and group count', async () => {
    renderCreate();
    const summary = screen.getByRole('region', { name: '這一輪' });
    expect(within(summary).getByText('題數')).toBeInTheDocument();
    expect(within(summary).getByText(/第 1、2 題/)).toBeInTheDocument();
    expect(within(summary).getByText('成功規則')).toBeInTheDocument();
    expect(within(summary).getByText('學生加入')).toBeInTheDocument();
    const before = groupCount();
    await userEvent.click(plus());
    expect(within(summary).getByText(`${before + 1} 組`)).toBeInTheDocument();
  });
});

describe('SetupPage (T-Setup) create mode (FR-024)', () => {
  it('has "上一步" and "建立活動" only', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: '上一步' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '建立活動' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '儲存設定' })).not.toBeInTheDocument();
  });

  it('"上一步" goes back to T-Import without a service call', async () => {
    const { navigate, registry, result } = renderCreate();
    await userEvent.click(screen.getByRole('button', { name: '上一步' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Import', result });
    expectNoServiceCall(registry.activity);
  });

  it('"建立活動" creates with the entered group count and goes to T-Lobby (US2 AC-8)', async () => {
    const created = makeActivity();
    const { navigate, registry } = renderCreate({
      createActivity: vi.fn().mockResolvedValue(created),
    });
    const count = groupCount() + 1;
    await userEvent.click(plus());
    await userEvent.click(screen.getByRole('button', { name: '建立活動' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: 'T-Lobby', activity: created }));
    expect(registry.activity.createActivity).toHaveBeenCalledWith({ groupCount: count });
  });

  it('stays and shows a ValidationError beside the group count field (edge, FR-008, US2 AC-9)', async () => {
    const { navigate } = renderCreate({ createActivity: vi.fn().mockResolvedValue(VALIDATION) });
    await userEvent.click(screen.getByRole('button', { name: '建立活動' }));
    expect(await within(groupField()).findByText('模擬：驗證失敗')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the entered count and shows an unexpected error in the error area (FR-009)', async () => {
    const { navigate } = renderCreate({ createActivity: vi.fn().mockRejectedValue(UNEXPECTED) });
    await userEvent.click(plus());
    await userEvent.click(plus());
    const entered = groupCount();
    await userEvent.click(screen.getByRole('button', { name: '建立活動' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(groupCount()).toBe(entered);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('SetupPage (T-Setup) edit mode (FR-024, US2 AC-10)', () => {
  const current = makeActivity({ groups: makeGroups([3, 2, 0, 1]) });

  it('starts from the activity group count and has "取消" and "儲存設定" only', () => {
    renderEdit(current);
    expect(groupCount()).toBe(4);
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '儲存設定' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '建立活動' })).not.toBeInTheDocument();
  });

  it('"取消" goes back to T-Lobby with the unchanged activity and no service call', async () => {
    const { navigate, registry } = renderEdit(current);
    await userEvent.click(plus());
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Lobby', activity: current });
    expectNoServiceCall(registry.activity);
  });

  it('"儲存設定" saves the entered count and goes to T-Lobby with the returned activity', async () => {
    const saved = makeActivity({ groups: makeGroups([3, 2, 0]) });
    const { navigate, registry } = renderEdit(current, {
      updateSettings: vi.fn().mockResolvedValue(saved),
    });
    await userEvent.click(minus());
    await userEvent.click(screen.getByRole('button', { name: '儲存設定' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: 'T-Lobby', activity: saved }));
    expect(registry.activity.updateSettings).toHaveBeenCalledWith({ groupCount: 3 });
    expect(registry.activity.createActivity).not.toHaveBeenCalled();
  });

  it('stays and shows a ValidationError beside the group count field (edge, US2 AC-9)', async () => {
    const { navigate } = renderEdit(current, {
      updateSettings: vi.fn().mockResolvedValue(VALIDATION),
    });
    await userEvent.click(screen.getByRole('button', { name: '儲存設定' }));
    expect(await within(groupField()).findByText('模擬：驗證失敗')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

// Phase 8.7 (issues #26, #28): the success rule text and 004's group count rules and texts.
describe('SetupPage (T-Setup) rules and texts (FR-023, D18, 004 C2)', () => {
  it('shows the full success rule, including that a rejected group cannot submit again (T160, D18, #26)', () => {
    renderCreate();
    expect(summaryEntry('成功規則')).toBe(
      '老師依送出順序判定，第一個被接受的組別搶答成功，這一題隨即結束；老師只能判定最早一筆還沒判定的答案。每組每題只能送出一次，被拒絕後不能重送。',
    );
  });

  it('starts create mode at GROUP_COUNT_DEFAULT groups (T161, US2 AC-6, D5)', () => {
    renderCreate();
    expect(groupCount()).toBe(GROUP_COUNT_DEFAULT);
    expect(within(groupField()).getByText(`${GROUP_COUNT_DEFAULT} 組`)).toBeInTheDocument();
  });

  it('disables "−" at GROUP_COUNT_MIN and never goes below it (T161, US2 AC-7, D4)', async () => {
    renderCreate();
    await clickTimes(minus, GROUP_COUNT_DEFAULT - GROUP_COUNT_MIN);
    expect(groupCount()).toBe(GROUP_COUNT_MIN);
    expect(minus()).toBeDisabled();
    expect(plus()).toBeEnabled();
    await userEvent.click(minus());
    expect(groupCount()).toBe(GROUP_COUNT_MIN);
  });

  it('disables "+" at GROUP_COUNT_MAX and never goes above it (T161, US2 AC-7, D4)', async () => {
    renderCreate();
    await clickTimes(plus, GROUP_COUNT_MAX - GROUP_COUNT_DEFAULT);
    expect(groupCount()).toBe(GROUP_COUNT_MAX);
    expect(plus()).toBeDisabled();
    expect(minus()).toBeEnabled();
    await userEvent.click(plus());
    expect(groupCount()).toBe(GROUP_COUNT_MAX);
  });

  it('applies the same limits in edit mode, starting from the activity group count (T161, US2 AC-7)', () => {
    renderEdit(makeActivity({ groups: makeGroups([1, 0]) }));
    expect(groupCount()).toBe(GROUP_COUNT_MIN);
    expect(minus()).toBeDisabled();
    expect(plus()).toBeEnabled();
  });

  it('shows JOIN_METHOD_TEXT as how students join (T161, FR-023, 004 C2)', () => {
    renderCreate();
    expect(summaryEntry('學生加入')).toBe(JOIN_METHOD_TEXT);
  });
});
