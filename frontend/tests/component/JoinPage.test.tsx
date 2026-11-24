// T047, T117, T079: S-Join display, 返回首頁, and selecting and joining a group
// (US4 AC-1–AC-4, FR-050, FR-056a, research RD-14).
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@quiz-buzzer/shared/entities';
import type { ActivityService, SubmissionService } from '../../src/services/interfaces';
import { JoinPage } from '../../src/pages/student/JoinPage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity, makeGroups, makeSubmission } from '../helpers/fixtures';

function setup(
  current: Activity | null,
  {
    previousGroup,
    activity,
    submission,
  }: {
    previousGroup?: number;
    activity?: Partial<ActivityService>;
    submission?: Partial<SubmissionService>;
  } = {},
) {
  let notify: (activity: Activity | null) => void = () => {};
  const unsubscribe = vi.fn();
  const registry = createFakeRegistry({
    activity: {
      getCurrentActivity: vi.fn().mockResolvedValue(current),
      onPhaseChange: vi.fn((listener) => {
        notify = listener;
        return unsubscribe;
      }),
      ...activity,
    },
    submission,
  });
  const navigate = vi.fn();
  const view = renderWithRegistry(
    <JoinPage navigate={navigate} previousGroup={previousGroup} />,
    registry,
  );
  return { view, registry, navigate, unsubscribe, notify: (a: Activity | null) => act(() => notify(a)) };
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

  describe('activity cancelled: onPhaseChange notifies null (T150, FR-050, S11, edge)', () => {
    const groupRadio = (n: number) => screen.getByRole('radio', { name: new RegExp(`第 ${n} 組`) });

    it.each([
      ['after selecting group 2', undefined],
      ['when entered with previousGroup 2', 2],
    ])('shows "no activity", clears the selection and calls no service %s', async (_, previousGroup) => {
      const { registry, navigate, notify } = setup(makeActivity({ groups: makeGroups([1, 1, 1]) }), {
        previousGroup,
      });
      await screen.findByText('第 1 組');
      if (previousGroup === undefined) await userEvent.click(groupRadio(2));
      expect(screen.getByRole('button', { name: '加入第 2 組' })).toBeEnabled();

      notify(null);
      expect(screen.getByText('目前沒有活動，請等老師建立活動')).toBeInTheDocument();
      expect(screen.queryByText(/第 \d+ 組/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '加入第 2 組' })).not.toBeInTheDocument();
      expect(screen.queryByText('準備中')).not.toBeInTheDocument();

      notify(makeActivity({ groups: makeGroups([1, 1, 1]) }));
      expect(screen.getByText('第 2 組')).toBeInTheDocument();
      expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
      expect(screen.queryByRole('button', { name: /^加入第 \d+ 組$/ })).not.toBeInTheDocument();

      expect(registry.activity.joinGroup).not.toHaveBeenCalled();
      expect(registry.activity.leaveGroup).not.toHaveBeenCalled();
      expect(registry.submission.getGroupSubmission).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
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

describe('JoinPage (S-Join) selecting and joining (US4)', () => {
  const groupRadio = (n: number) => screen.getByRole('radio', { name: new RegExp(`第 ${n} 組`) });
  /** The bottom join button, whatever its label before a group is selected. */
  const joinButton = () => screen.getByRole('button', { name: /^加入/ });

  it('keeps the join button disabled until a group is selected (edge, US4 AC-2)', async () => {
    setup(makeActivity());
    await screen.findByText('第 1 組');
    expect(joinButton()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^加入第 \d+ 組$/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('marks the clicked group as selected and labels the button "加入第 n 組" (US4 AC-1)', async () => {
    setup(makeActivity({ groups: makeGroups([3, 2, 0]) }));
    await screen.findByText('第 1 組');
    await userEvent.click(groupRadio(2));
    expect(groupRadio(2)).toHaveAttribute('aria-checked', 'true');
    expect(groupRadio(1)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: '加入第 2 組' })).toBeEnabled();
    await userEvent.click(groupRadio(3));
    expect(groupRadio(3)).toHaveAttribute('aria-checked', 'true');
    expect(groupRadio(2)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: '加入第 3 組' })).toBeEnabled();
  });

  it('preselects the group passed back from S-Wait (US4 AC-4)', async () => {
    setup(makeActivity(), { previousGroup: 2 });
    await screen.findByText('第 1 組');
    expect(groupRadio(2)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: '加入第 2 組' })).toBeEnabled();
  });

  /** Selects group 2, joins, and returns what joinGroup resolved with. */
  async function join(joined: Activity, submission?: Partial<SubmissionService>) {
    const result = setup(makeActivity(), {
      activity: { joinGroup: vi.fn().mockResolvedValue(joined) },
      submission,
    });
    await screen.findByText('第 1 組');
    await userEvent.click(groupRadio(2));
    await userEvent.click(screen.getByRole('button', { name: '加入第 2 組' }));
    return result;
  }

  it('joins with joinGroup(n) and goes to S-Wait while PREPARING (US4 AC-3)', async () => {
    const joined = makeActivity({ phase: 'PREPARING' });
    const { registry, navigate } = await join(joined);
    expect(registry.activity.joinGroup).toHaveBeenCalledWith(2);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Wait', groupNumber: 2, activity: joined });
    expect(registry.submission.getGroupSubmission).not.toHaveBeenCalled();
  });

  it('goes to S-QuestionDone when joining after the question ended (S8)', async () => {
    const joined = makeActivity({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
    const { navigate } = await join(joined);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-QuestionDone', groupNumber: 2, activity: joined });
  });

  it('goes to S-Results when joining after the activity finished (S9)', async () => {
    const joined = makeActivity({ phase: 'FINISHED', currentQuestion: 4 });
    const { navigate } = await join(joined);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Results', groupNumber: 2 });
  });

  it('asks getGroupSubmission(q) while OPEN and goes to S-Answer when the group has none (S4)', async () => {
    const joined = makeActivity({ phase: 'OPEN', currentQuestion: 2 });
    const { registry, navigate } = await join(joined, {
      getGroupSubmission: vi.fn().mockResolvedValue(null),
    });
    expect(registry.submission.getGroupSubmission).toHaveBeenCalledWith(2);
    expect(navigate).toHaveBeenCalledWith({ id: 'S-Answer', groupNumber: 2, activity: joined });
  });

  it.each([
    ['PENDING', 'waiting for a judgement'],
    ['REJECTED', 'not accepted'],
  ] as const)(
    'goes to S-Submitted with the %s groupmate submission (%s; S10, FR-056a, edge)',
    async (judgement, _state) => {
      void _state;
      const joined = makeActivity({ phase: 'OPEN', currentQuestion: 2 });
      const existing = makeSubmission({ questionNumber: 2, groupNumber: 2, answers: ['IP'], judgement });
      const { navigate } = await join(joined, {
        getGroupSubmission: vi.fn().mockResolvedValue(existing),
      });
      expect(navigate).toHaveBeenCalledWith({
        id: 'S-Submitted',
        groupNumber: 2,
        activity: joined,
        submission: existing,
      });
      expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'S-Answer' }));
    },
  );

  it('stays and shows an unexpected error from joinGroup in the error area (FR-009)', async () => {
    const setupResult = setup(makeActivity(), {
      activity: { joinGroup: vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' }) },
    });
    await screen.findByText('第 1 組');
    await userEvent.click(groupRadio(2));
    await userEvent.click(screen.getByRole('button', { name: '加入第 2 組' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(setupResult.navigate).not.toHaveBeenCalled();
    expect(groupRadio(2)).toHaveAttribute('aria-checked', 'true');
  });
});
