import { beforeEach, describe, expect, it } from 'vitest';
import { ActivityManager, ActivityRuleError } from '../../../src/activity/ActivityManager.js';
import { ActivityStore } from '../../../src/activity/ActivityStore.js';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';
import { GroupMembership } from '../../../src/activity/GroupMembership.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { ImportStore } from '../../../src/guided-notes/ImportStore.js';
import { fourQuestionImport } from '../../helpers/activityTestServer.js';

// T054: cancelActivity (data-model "狀態轉換", research RA-17); REQ-ACT-22, AC-34, AC-35, AC-36.
let queue: CommandQueue;
let store: ActivityStore;
let membership: GroupMembership;
let manager: ActivityManager;

function ruleErrorOf(command: () => unknown): ActivityRuleError {
  try {
    command();
  } catch (error) {
    expect(error).toBeInstanceOf(ActivityRuleError);
    return error as ActivityRuleError;
  }
  throw new Error('expected an ActivityRuleError');
}

function join(socketId: string, groupNumber: number): void {
  queue.run(() => membership.join({ id: socketId }, groupNumber));
}

beforeEach(() => {
  queue = new CommandQueue();
  store = new ActivityStore();
  membership = new GroupMembership();
  const importStore = new ImportStore();
  importStore.save(fourQuestionImport(), {});
  manager = new ActivityManager(queue, store, membership, new SequenceClock(), importStore);
});

describe('ActivityManager.cancelActivity', () => {
  it('removes a PREPARING activity, adds 1 to the version and empties every group (REQ-ACT-22)', () => {
    manager.createActivity({ groupCount: 4 });
    join('s1', 1);
    join('s2', 3);
    expect(manager.cancelActivity()).toEqual({ version: 2, activity: null });
    expect(store.current()).toBeNull();
    expect(store.version()).toBe(2);
    expect(membership.memberCounts(4)).toEqual([0, 0, 0, 0]);
    expect(membership.highestOccupiedGroup()).toBe(0);
    expect(membership.groupOf({ id: 's1' })).toBeNull();
  });

  it('lets the teacher create again afterwards, with every group starting at 0 (AC-34)', () => {
    manager.createActivity({ groupCount: 4 });
    join('s1', 2);
    manager.cancelActivity();
    const result = manager.createActivity({ groupCount: 6 });
    expect(result).toMatchObject({
      version: 3,
      activity: { phase: 'PREPARING', groupCount: 6, groups: [1, 2, 3, 4, 5, 6].map((number) => ({ number, memberCount: 0 })) },
    });
  });

  it.each([
    ['OPEN', 1],
    ['QUESTION_ENDED', 1],
    ['FINISHED', 4],
  ] as const)('refuses with CANCEL_LOCKED when %s and changes nothing (AC-35)', (phase, currentQuestion) => {
    manager.createActivity({ groupCount: 4 });
    join('s1', 2);
    queue.run(() => store.commit({ ...store.current()!, phase, currentQuestion }));
    const before = store.current();
    const error = ruleErrorOf(() => manager.cancelActivity());
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'CANCEL_LOCKED',
      message: '第 1 題開放後不能取消活動',
    });
    expect(store.current()).toBe(before);
    expect(store.version()).toBe(2);
    expect(membership.memberCounts(4)).toEqual([0, 1, 0, 0]);
  });

  it('does not commit when there is no activity and answers the current snapshot (AC-36)', () => {
    expect(manager.cancelActivity()).toEqual({ version: 0, activity: null });
    expect(store.version()).toBe(0);

    manager.createActivity({ groupCount: 4 });
    manager.cancelActivity();
    expect(manager.cancelActivity()).toEqual({ version: 2, activity: null });
    expect(store.version()).toBe(2);
  });

  it('refuses updateSettings with NO_ACTIVITY after cancelling', () => {
    manager.createActivity({ groupCount: 4 });
    manager.cancelActivity();
    const error = ruleErrorOf(() => manager.updateSettings({ groupCount: 6 }));
    expect(error.code).toBe('NO_ACTIVITY');
    expect(store.version()).toBe(2);
  });

  // Needs joinGroup (T032, Phase 4); unskip in Phase 4's Red.
  it.skip('refuses joinGroup with NO_ACTIVITY after cancelling', () => {
    manager.createActivity({ groupCount: 4 });
    manager.cancelActivity();
    const ack = manager.joinGroup({ id: 's1' }, 1);
    expect(ack.error).toEqual({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
    expect(ack.snapshot).toEqual({ version: 2, activity: null });
    expect(store.version()).toBe(2);
  });
});
