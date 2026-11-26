import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActivityManager, ActivityRuleError } from '../../../src/activity/ActivityManager.js';
import { ActivityStore } from '../../../src/activity/ActivityStore.js';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';
import { GroupMembership } from '../../../src/activity/GroupMembership.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { ImportStore } from '../../../src/guided-notes/ImportStore.js';
import { fourQuestionImport } from '../../helpers/activityTestServer.js';

// T023: createActivity and updateSettings (data-model "ActivityManager", "ActivityRuleError",
// "ValidationError 的內容"); AC-03, AC-04, AC-05, AC-06, AC-08, AC-32, REQ-ACT-01.
const GROUP_COUNT_INVALID = { field: 'groupCount', message: '組數必須是 2 到 20 之間的整數' };
const ACTIVITY_EXISTS_MESSAGE = '已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器';

let queue: CommandQueue;
let store: ActivityStore;
let membership: GroupMembership;
let manager: ActivityManager;

function setUp(importResult: ImportSuccess | null = fourQuestionImport()): void {
  queue = new CommandQueue();
  store = new ActivityStore();
  membership = new GroupMembership();
  const importStore = new ImportStore();
  if (importResult) importStore.save(importResult, {});
  manager = new ActivityManager(queue, store, membership, new SequenceClock(), importStore);
}

/** The ActivityRuleError `command` throws; fails the test when it throws nothing. */
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

beforeEach(() => setUp());

describe('ActivityManager.createActivity', () => {
  it('creates a PREPARING activity from the import with groups 1..n at 0 members (AC-03)', () => {
    const imported = fourQuestionImport();
    const result = manager.createActivity({ groupCount: 4 });
    expect(result).toEqual({
      version: 1,
      activity: {
        groupCount: 4,
        phase: 'PREPARING',
        spreadsheet: imported.spreadsheet,
        questions: imported.questions,
        groups: [1, 2, 3, 4].map((number) => ({ number, memberCount: 0 })),
      },
    });
    expect(store.version()).toBe(1);
    expect(store.current()).toMatchObject({ phase: 'PREPARING', groupCount: 4, questions: imported.questions });
    expect(store.current()?.currentQuestion).toBeUndefined();
  });

  it.each([1, 21, 3.5, 0, -2])('answers ValidationError for %s groups and creates nothing (AC-04)', (groupCount) => {
    expect(manager.createActivity({ groupCount })).toEqual(GROUP_COUNT_INVALID);
    expect(store.current()).toBeNull();
    expect(store.version()).toBe(0);
  });

  it('answers ValidationError when groupCount is not a number (AC-04)', () => {
    expect(manager.createActivity({ groupCount: '4' } as never)).toEqual(GROUP_COUNT_INVALID);
    expect(manager.createActivity({} as never)).toEqual(GROUP_COUNT_INVALID);
    expect(store.version()).toBe(0);
  });

  it.each([2, 20])('accepts the boundary value %s', (groupCount) => {
    const result = manager.createActivity({ groupCount });
    expect(result).toMatchObject({ activity: { groupCount } });
  });

  it('refuses a second activity with ACTIVITY_EXISTS and leaves the first unchanged (AC-06, AC-32)', () => {
    manager.createActivity({ groupCount: 4 });
    const before = store.current();
    const error = ruleErrorOf(() => manager.createActivity({ groupCount: 6 }));
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'ACTIVITY_EXISTS',
      message: ACTIVITY_EXISTS_MESSAGE,
    });
    expect(store.current()).toBe(before);
    expect(store.version()).toBe(1);
  });

  it('refuses with NO_IMPORT when nothing has been imported (REQ-ACT-01)', () => {
    setUp(null);
    const error = ruleErrorOf(() => manager.createActivity({ groupCount: 4 }));
    expect({ code: error.code, message: error.message }).toEqual({ code: 'NO_IMPORT', message: '請先匯入學習單' });
    expect(store.current()).toBeNull();
    expect(store.version()).toBe(0);
  });
});

describe('ActivityManager.updateSettings', () => {
  beforeEach(() => {
    manager.createActivity({ groupCount: 4 });
  });

  it('changes the group count while PREPARING and commits a new version', () => {
    const result = manager.updateSettings({ groupCount: 6 });
    expect(result).toMatchObject({
      version: 2,
      activity: { phase: 'PREPARING', groupCount: 6, groups: [1, 2, 3, 4, 5, 6].map((number) => ({ number, memberCount: 0 })) },
    });
    expect(store.current()?.groupCount).toBe(6);
  });

  it('keeps the members already in groups when the count grows', () => {
    join('s1', 2);
    const result = manager.updateSettings({ groupCount: 5 });
    expect(result).toMatchObject({ activity: { groups: [0, 1, 0, 0, 0].map((memberCount, i) => ({ number: i + 1, memberCount })) } });
  });

  it.each([1, 21, 3.5])('answers ValidationError for %s groups and leaves the activity unchanged (AC-04)', (groupCount) => {
    expect(manager.updateSettings({ groupCount })).toEqual(GROUP_COUNT_INVALID);
    expect(store.current()?.groupCount).toBe(4);
    expect(store.version()).toBe(1);
  });

  it('refuses fewer groups than the highest group with students (AC-05)', () => {
    join('s1', 3);
    expect(manager.updateSettings({ groupCount: 2 })).toEqual({
      field: 'groupCount',
      message: '第 3 組已有學生加入，組數不能少於 3',
    });
    expect(store.current()?.groupCount).toBe(4);
    expect(store.version()).toBe(1);
    expect(manager.updateSettings({ groupCount: 3 })).toMatchObject({ activity: { groupCount: 3 } });
  });

  it('refuses with SETTINGS_LOCKED once question 1 has opened (AC-08)', () => {
    queue.run(() => store.commit({ ...store.current()!, phase: 'OPEN', currentQuestion: 1 }));
    const before = store.current();
    const error = ruleErrorOf(() => manager.updateSettings({ groupCount: 6 }));
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'SETTINGS_LOCKED',
      message: '第 1 題開放後不能修改設定',
    });
    expect(store.current()).toBe(before);
    expect(store.version()).toBe(2);
  });

  it('refuses with NO_ACTIVITY when there is no activity', () => {
    setUp();
    const error = ruleErrorOf(() => manager.updateSettings({ groupCount: 6 }));
    expect({ code: error.code, message: error.message }).toEqual({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
    expect(store.version()).toBe(0);
  });
});
