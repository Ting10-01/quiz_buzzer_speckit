import { beforeEach, describe, expect, it } from 'vitest';
import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import { ActivityManager } from '../../../src/activity/ActivityManager.js';
import { ActivityStore } from '../../../src/activity/ActivityStore.js';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';
import { GroupMembership } from '../../../src/activity/GroupMembership.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { ImportStore } from '../../../src/guided-notes/ImportStore.js';
import { fourQuestionImport } from '../../helpers/activityTestServer.js';

// T029: joinGroup / leaveGroup (data-model "組別規則", "加入與離開組別被拒絕"); REQ-ACT-10, 11, 13.
let queue: CommandQueue;
let store: ActivityStore;
let membership: GroupMembership;
let manager: ActivityManager;

const BLANK_SPREADSHEET = { id: '', title: '', editable: false, worksheets: [], selectedWorksheet: '' };
const s1 = { id: 's1' };
const s2 = { id: 's2' };

beforeEach(() => {
  queue = new CommandQueue();
  store = new ActivityStore();
  membership = new GroupMembership();
  const importStore = new ImportStore();
  importStore.save(fourQuestionImport(), {});
  manager = new ActivityManager(queue, store, membership, new SequenceClock(), importStore);
});

function createWithGroups(groupCount = 4): void {
  manager.createActivity({ groupCount });
}

/** Question 1 has opened; the activity is now in `phase`. */
function lock(phase: 'OPEN' | 'QUESTION_ENDED' | 'FINISHED', currentQuestion = 1): void {
  queue.run(() => store.commit({ ...store.current()!, phase, currentQuestion }));
}

function memberCounts(ack: GroupAck): number[] {
  return ack.snapshot.activity!.groups.map((group) => group.memberCount);
}

describe('ActivityManager.joinGroup', () => {
  it('refuses with NO_ACTIVITY when there is no activity and does not commit', () => {
    const ack = manager.joinGroup(s1, 1);
    expect(ack).toEqual({
      snapshot: { version: 0, activity: null },
      error: { code: 'NO_ACTIVITY', message: '目前沒有活動' },
    });
    expect(ack.studentToken).toBeUndefined();
    expect(store.version()).toBe(0);
    expect(membership.groupOf(s1)).toBeNull();
  });

  it.each([0, 5, -1, 2.5])('refuses group %s of 4 with NO_SUCH_GROUP and changes nothing', (groupNumber) => {
    createWithGroups(4);
    const ack = manager.joinGroup(s1, groupNumber);
    expect(ack.error).toEqual({ code: 'NO_SUCH_GROUP', message: `沒有第 ${groupNumber} 組` });
    expect(ack.studentToken).toBeUndefined();
    expect(memberCounts(ack)).toEqual([0, 0, 0, 0]);
    expect(store.version()).toBe(1);
    expect(membership.groupOf(s1)).toBeNull();
  });

  it('joins a group, answers a studentToken and commits a new version (REQ-ACT-10)', () => {
    createWithGroups(4);
    const ack = manager.joinGroup(s1, 3);
    expect(ack.error).toBeUndefined();
    expect(ack.studentToken).toEqual(expect.any(String));
    expect(ack.snapshot.version).toBe(2);
    expect(store.version()).toBe(2);
    expect(memberCounts(ack)).toEqual([0, 0, 1, 0]);
    expect(membership.groupOf(s1)).toBe(3);
  });

  it('counts two connections in the same group as 2 members (REQ-ACT-10)', () => {
    createWithGroups(4);
    manager.joinGroup(s1, 3);
    const ack = manager.joinGroup(s2, 3);
    expect(memberCounts(ack)).toEqual([0, 0, 2, 0]);
    expect(store.version()).toBe(3);
  });

  it('answers the PUBLIC snapshot: the spreadsheet is blank (REQ-ACT-19)', () => {
    createWithGroups(4);
    const ack = manager.joinGroup(s1, 1);
    expect(ack.snapshot.activity!.spreadsheet).toEqual(BLANK_SPREADSHEET);
    const refused = manager.joinGroup(s1, 9);
    expect(refused.snapshot.activity!.spreadsheet).toEqual(BLANK_SPREADSHEET);
  });

  it('does not count the same connection twice when it joins its group again (REQ-ACT-13)', () => {
    createWithGroups(4);
    const first = manager.joinGroup(s1, 3);
    const again = manager.joinGroup(s1, 3);
    expect(again.error).toBeUndefined();
    expect(again.studentToken).toBe(first.studentToken);
    expect(memberCounts(again)).toEqual([0, 0, 1, 0]);
    // Every successful join commits, even when the members do not change (tasks T029).
    expect(again.snapshot.version).toBe(3);
    expect(store.version()).toBe(3);
  });

  it('moves the connection to another group while PREPARING (REQ-ACT-11)', () => {
    createWithGroups(6);
    manager.joinGroup(s1, 3);
    const ack = manager.joinGroup(s1, 5);
    expect(ack.error).toBeUndefined();
    expect(memberCounts(ack)).toEqual([0, 0, 0, 0, 1, 0]);
    expect(membership.groupOf(s1)).toBe(5);
    expect(store.version()).toBe(3);
  });

  it.each([
    ['OPEN', 1],
    ['QUESTION_ENDED', 1],
    ['FINISHED', 4],
  ] as const)('refuses moving to another group when %s with GROUP_LOCKED (REQ-ACT-11)', (phase, currentQuestion) => {
    createWithGroups(6);
    manager.joinGroup(s1, 3);
    lock(phase, currentQuestion);
    const version = store.version();
    const ack = manager.joinGroup(s1, 5);
    expect(ack.error).toEqual({ code: 'GROUP_LOCKED', message: '第 1 題開放後不能換組，你在第 3 組' });
    expect(ack.studentToken).toBeUndefined();
    expect(memberCounts(ack)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(ack.snapshot.activity!.phase).toBe(phase);
    expect(store.version()).toBe(version);
    expect(membership.groupOf(s1)).toBe(3);
  });

  it('lets a locked connection join its own group again without counting it twice (REQ-ACT-13)', () => {
    createWithGroups(6);
    const first = manager.joinGroup(s1, 3);
    lock('OPEN', 2);
    const version = store.version();
    const ack = manager.joinGroup(s1, 3);
    expect(ack.error).toBeUndefined();
    expect(ack.studentToken).toBe(first.studentToken);
    expect(memberCounts(ack)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(ack.snapshot.version).toBe(version + 1);
    expect(store.version()).toBe(version + 1);
    expect(ack.snapshot.activity!).toMatchObject({ phase: 'OPEN', currentQuestion: 2 });
  });

  it.each([
    ['OPEN', 2],
    ['QUESTION_ENDED', 2],
    ['FINISHED', 4],
  ] as const)('lets a connection that has not joined join any group when %s (REQ-ACT-11)', (phase, currentQuestion) => {
    createWithGroups(6);
    lock(phase, currentQuestion);
    const version = store.version();
    const ack = manager.joinGroup(s2, 4);
    expect(ack.error).toBeUndefined();
    expect(ack.studentToken).toEqual(expect.any(String));
    expect(memberCounts(ack)).toEqual([0, 0, 0, 1, 0, 0]);
    expect(ack.snapshot.activity!).toMatchObject({ phase, currentQuestion });
    expect(store.version()).toBe(version + 1);
  });
});

describe('ActivityManager.leaveGroup', () => {
  it('leaves the group while PREPARING and commits a new version (REQ-ACT-11)', () => {
    createWithGroups(4);
    manager.joinGroup(s1, 3);
    const ack = manager.leaveGroup(s1);
    expect(ack.error).toBeUndefined();
    expect(memberCounts(ack)).toEqual([0, 0, 0, 0]);
    expect(ack.snapshot.version).toBe(3);
    expect(store.version()).toBe(3);
    expect(membership.groupOf(s1)).toBeNull();
  });

  it('succeeds without changing the members when the connection has not joined', () => {
    createWithGroups(4);
    manager.joinGroup(s2, 2);
    const ack = manager.leaveGroup(s1);
    expect(ack.error).toBeUndefined();
    expect(memberCounts(ack)).toEqual([0, 1, 0, 0]);
    // Every successful leave commits, even when the members do not change (tasks T029).
    expect(ack.snapshot.version).toBe(3);
    expect(store.version()).toBe(3);
  });

  it.each([
    ['OPEN', 1],
    ['QUESTION_ENDED', 1],
    ['FINISHED', 4],
  ] as const)('refuses leaving when %s with GROUP_LOCKED and stays in the group (REQ-ACT-11)', (phase, currentQuestion) => {
    createWithGroups(4);
    manager.joinGroup(s1, 3);
    lock(phase, currentQuestion);
    const version = store.version();
    const ack = manager.leaveGroup(s1);
    expect(ack.error).toEqual({ code: 'GROUP_LOCKED', message: '第 1 題開放後不能換組，你在第 3 組' });
    expect(memberCounts(ack)).toEqual([0, 0, 1, 0]);
    expect(store.version()).toBe(version);
    expect(membership.groupOf(s1)).toBe(3);
  });

  it('answers the PUBLIC snapshot', () => {
    createWithGroups(4);
    manager.joinGroup(s1, 3);
    expect(manager.leaveGroup(s1).snapshot.activity!.spreadsheet).toEqual(BLANK_SPREADSHEET);
  });
});

describe('ActivityManager group commands and CommandQueue', () => {
  it('runs joinGroup and leaveGroup inside CommandQueue.run', () => {
    createWithGroups(4);
    let insideRun = 0;
    const run = queue.run.bind(queue);
    queue.run = <T>(command: () => T): T => {
      insideRun++;
      return run(command);
    };
    manager.joinGroup(s1, 1);
    manager.leaveGroup(s1);
    expect(insideRun).toBe(2);
  });
});
