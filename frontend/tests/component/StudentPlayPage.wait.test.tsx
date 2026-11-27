// T080: S-Wait (FR-051, FR-007, FR-014, US4 AC-3, AC-4).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WAIT_ROUND_TEXT } from '@quiz-buzzer/shared/activityRules';
import { makeActivity, makeGroups } from '../helpers/fixtures';
import { goBack } from '../helpers/pageQueries';
import {
  joinFromHome,
  renderStudentPage,
  renderStudentRouter,
  studentEvents,
  studentRegistry,
} from '../helpers/studentHarness';

const preparing = () => makeActivity({ phase: 'PREPARING', groups: makeGroups([3, 2, 0]) });

function setup() {
  const events = studentEvents();
  const registry = studentRegistry(events, {
    activity: { leaveGroup: vi.fn().mockResolvedValue(undefined) },
  });
  const activity = preparing();
  const result = renderStudentPage({ id: 'S-Wait', groupNumber: 2, activity }, registry);
  return { ...result, events, registry, activity };
}

describe('StudentPlayPage S-Wait', () => {
  it('shows the group, the PREPARING phase and the place for this round’s notes (FR-051, US4 AC-3)', () => {
    setup();
    expect(within(screen.getByRole('banner')).getByText('第 2 組')).toBeInTheDocument();
    expect(screen.getAllByText('準備中').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: '這一輪' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '選錯組別？重新選擇' })).toBeEnabled();
  });

  it('offers no way back home (FR-007)', () => {
    setup();
    expect(screen.queryByRole('button', { name: '返回首頁' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /搶答板/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('leaves the group without a group argument and goes back to S-Join with it selected (US4 AC-4)', async () => {
    const { registry, navigate } = setup();
    await userEvent.click(screen.getByRole('button', { name: '選錯組別？重新選擇' }));
    expect(registry.activity.leaveGroup).toHaveBeenCalledTimes(1);
    expect(registry.activity.leaveGroup).toHaveBeenCalledWith();
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Join', previousGroup: 2 });
  });

  it('stays and shows an unexpected error from leaveGroup in the error area (FR-009)', async () => {
    const { registry, navigate } = setup();
    vi.mocked(registry.activity.leaveGroup).mockRejectedValueOnce({ message: '模擬：連不上伺服器' });
    await userEvent.click(screen.getByRole('button', { name: '選錯組別？重新選擇' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes to S-Answer when OPEN is notified (FR-006)', () => {
    const { events, navigate, activity } = setup();
    const opened = { ...activity, phase: 'OPEN' as const, currentQuestion: 1 };
    events.phase.emit(opened);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Answer', groupNumber: 2, activity: opened });
    expect(screen.getByRole('button', { name: '整組送出' })).toBeInTheDocument();
  });

  it('goes to S-Join without previousGroup and without leaveGroup when null is notified (T151, FR-051, S11)', () => {
    const { events, navigate, registry } = setup();
    events.phase.emit(null);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Join' });
    expect(registry.activity.leaveGroup).not.toHaveBeenCalled();
  });

  it('unsubscribes from phase changes when it unmounts', () => {
    const { events, view } = setup();
    expect(events.phase.listeners.size).toBe(1);
    view.unmount();
    expect(events.phase.listeners.size).toBe(0);
  });
});

describe('S-Wait inside AppRouter', () => {
  function setupRouter() {
    const events = studentEvents();
    const registry = studentRegistry(events, {
      activity: {
        getCurrentActivity: vi.fn().mockResolvedValue(preparing()),
        joinGroup: vi.fn().mockResolvedValue(preparing()),
        leaveGroup: vi.fn().mockResolvedValue(undefined),
      },
    });
    renderStudentRouter(registry);
    return { registry };
  }

  it('stays on S-Wait on browser back (FR-014, edge)', async () => {
    setupRouter();
    await joinFromHome(2);
    await screen.findByRole('button', { name: '選錯組別？重新選擇' });
    goBack();
    expect(screen.getByRole('button', { name: '選錯組別？重新選擇' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '組別' })).not.toBeInTheDocument();
  });

  it('returns to S-Join with the old group still selected (US4 AC-4)', async () => {
    setupRouter();
    await joinFromHome(2);
    await userEvent.click(await screen.findByRole('button', { name: '選錯組別？重新選擇' }));
    const radio = await screen.findByRole('radio', { name: /第 2 組/ });
    expect(radio).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: '加入第 2 組' })).toBeEnabled();
  });

  it('puts the student page in the centred phone-width column', async () => {
    setupRouter();
    await joinFromHome(2);
    await screen.findByRole('button', { name: '選錯組別？重新選擇' });
    expect(
      within(screen.getByTestId('student-column')).getByRole('button', { name: '選錯組別？重新選擇' }),
    ).toBeInTheDocument();
  });
});

// Phase 8.7 (issue #28): 004's round text under the question count.
describe('StudentPlayPage S-Wait round text (FR-051, 004 C2)', () => {
  it('shows WAIT_ROUND_TEXT right under the question count (T162)', () => {
    const { activity } = setup();
    const round = screen.getByRole('region', { name: '這一輪' });
    const count = within(round).getByText(`共 ${activity.questions.length} 題`);
    const text = within(round).getByText(WAIT_ROUND_TEXT);
    expect(count.nextElementSibling).toBe(text);
  });
});
