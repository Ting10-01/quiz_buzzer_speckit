import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityManager, ActivityRuleError } from '../../../src/activity/ActivityManager.js';
import { ActivityStore, type ActivityState } from '../../../src/activity/ActivityStore.js';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';
import { GroupMembership } from '../../../src/activity/GroupMembership.js';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';
import { ImportStore } from '../../../src/guided-notes/ImportStore.js';
import { fourQuestionImport } from '../../helpers/activityTestServer.js';

// T035: openQuestion and endQuestion (data-model "狀態轉換"); REQ-ACT-05–08, 17, 18;
// AC-17–22, AC-30.

/** Answers 100, 200, 300, … so each recorded time can be told apart. */
class FakeClock extends SequenceClock {
  private next = 0;

  override stamp(): number {
    this.next += 100;
    return this.next;
  }
}

let queue: CommandQueue;
let store: ActivityStore;
let manager: ActivityManager;

function managerWith(clock: SequenceClock): ActivityManager {
  const importStore = new ImportStore();
  importStore.save(fourQuestionImport(), {});
  return new ActivityManager(queue, store, new GroupMembership(), clock, importStore);
}

function ruleErrorOf(command: () => unknown): ActivityRuleError {
  try {
    command();
  } catch (error) {
    expect(error).toBeInstanceOf(ActivityRuleError);
    return error as ActivityRuleError;
  }
  throw new Error('expected an ActivityRuleError');
}

/** Moves a fresh 4-question activity to `phase` without going through the commands under test. */
function at(phase: ActivityState['phase'], currentQuestion?: number): void {
  manager.createActivity({ groupCount: 4 });
  queue.run(() => store.commit({ ...store.current()!, phase, currentQuestion }));
}

beforeEach(() => {
  queue = new CommandQueue();
  store = new ActivityStore();
  manager = managerWith(new FakeClock());
});

describe('ActivityManager.openQuestion and endQuestion: allowed transitions (AC-17–20)', () => {
  it('walks PREPARING → OPEN(1) → QUESTION_ENDED(1) → … → OPEN(4) → FINISHED, one version each', () => {
    manager.createActivity({ groupCount: 4 });
    let version = store.version();

    for (let n = 1; n <= 4; n += 1) {
      const opened = manager.openQuestion(n);
      version += 1;
      expect(opened).toMatchObject({ version, activity: { phase: 'OPEN', currentQuestion: n } });
      expect(store.current()).toMatchObject({ phase: 'OPEN', currentQuestion: n });

      const ended = manager.endQuestion(n);
      version += 1;
      const phase = n === 4 ? 'FINISHED' : 'QUESTION_ENDED';
      expect(ended).toMatchObject({ version, activity: { phase, currentQuestion: n } });
      expect(store.version()).toBe(version);
    }
  });

  it('ends the last question straight to FINISHED with currentQuestion = 4 (AC-20)', () => {
    at('OPEN', 4);
    expect(manager.endQuestion(4).activity).toMatchObject({ phase: 'FINISHED', currentQuestion: 4 });
    expect(store.current()).toMatchObject({ phase: 'FINISHED', currentQuestion: 4 });
  });

  it('answers the teacher snapshot, with the spreadsheet', () => {
    manager.createActivity({ groupCount: 4 });
    expect(manager.openQuestion(1).activity?.spreadsheet.id).toBe('sheet-id-activity-0001');
  });

  it('notifies the store listeners once per change', () => {
    manager.createActivity({ groupCount: 4 });
    const listener = vi.fn();
    store.subscribe(listener);
    manager.openQuestion(1);
    manager.endQuestion(1);
    expect(listener.mock.calls).toEqual([[2], [3]]);
  });
});

describe('ActivityManager.openQuestion and endQuestion: refused (AC-21)', () => {
  it.each([
    ['PREPARING', undefined, 2],
    ['OPEN', 1, 2],
    ['QUESTION_ENDED', 1, 3],
    ['QUESTION_ENDED', 2, 2],
    ['QUESTION_ENDED', 2, 1],
    ['FINISHED', 4, 5],
    ['PREPARING', undefined, 0],
    ['PREPARING', undefined, 1.5],
  ] as const)('openQuestion when %s(%s) and asked for %s: QUESTION_NOT_NEXT, nothing changes', (phase, current, n) => {
    at(phase, current);
    const before = store.current();
    const version = store.version();
    const error = ruleErrorOf(() => manager.openQuestion(n));
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'QUESTION_NOT_NEXT',
      message: `現在不能開放第 ${n} 題`,
    });
    expect(store.current()).toBe(before);
    expect(store.version()).toBe(version);
  });

  it.each([
    ['PREPARING', undefined, 1],
    ['OPEN', 2, 3],
    ['OPEN', 2, 1],
    ['QUESTION_ENDED', 1, 2],
    ['FINISHED', 4, 5],
    ['OPEN', 1, 1.5],
  ] as const)('endQuestion when %s(%s) and asked for %s: QUESTION_NOT_OPEN, nothing changes', (phase, current, n) => {
    at(phase, current);
    const before = store.current();
    const version = store.version();
    const error = ruleErrorOf(() => manager.endQuestion(n));
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'QUESTION_NOT_OPEN',
      message: `第 ${n} 題目前沒有開放，不能結束`,
    });
    expect(store.current()).toBe(before);
    expect(store.version()).toBe(version);
  });

  it('refuses both with NO_ACTIVITY when there is no activity', () => {
    expect(ruleErrorOf(() => manager.openQuestion(1))).toMatchObject({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
    expect(ruleErrorOf(() => manager.endQuestion(1))).toMatchObject({ code: 'NO_ACTIVITY', message: '目前沒有活動' });
    expect(store.version()).toBe(0);
  });
});

describe('ActivityManager.openQuestion and endQuestion: repeated requests (AC-22, REQ-ACT-07)', () => {
  it('opening the open question again answers the current snapshot without a new version', () => {
    manager.createActivity({ groupCount: 4 });
    const first = manager.openQuestion(1);
    expect(manager.openQuestion(1)).toEqual(first);
    expect(store.version()).toBe(first.version);
  });

  it('ending the ended question again answers the current snapshot without a new version', () => {
    at('OPEN', 1);
    const first = manager.endQuestion(1);
    expect(manager.endQuestion(1)).toEqual(first);
    expect(store.version()).toBe(first.version);
  });

  it.each([4, 2])('ending question %s after FINISHED answers the current snapshot', (n) => {
    at('OPEN', 4);
    const finished = manager.endQuestion(4);
    expect(manager.endQuestion(n)).toEqual(finished);
    expect(store.version()).toBe(finished.version);
  });

  it('ends only once when 005 ends it inside CommandQueue.run and the teacher ends it after (REQ-ACT-08)', () => {
    at('OPEN', 1);
    // 005's judgement: the end runs in place, as part of the outer command.
    const byJudge = queue.run(() => manager.endQuestion(1));
    expect(byJudge.activity).toMatchObject({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
    const version = store.version();

    expect(manager.endQuestion(1)).toEqual(byJudge);
    expect(store.version()).toBe(version);
    expect(store.current()).toMatchObject({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
  });
});

describe('ActivityManager: opened and ended times (REQ-ACT-18, AC-30)', () => {
  it('records openedAt[n] and endedAt[n] with SequenceClock.stamp()', () => {
    manager.createActivity({ groupCount: 4 });
    manager.openQuestion(1);
    manager.endQuestion(1);
    manager.openQuestion(2);
    expect([...store.current()!.openedAt]).toEqual([
      [1, 100],
      [2, 300],
    ]);
    expect([...store.current()!.endedAt]).toEqual([[1, 200]]);
  });

  it('does not stamp again for a repeated request', () => {
    manager.createActivity({ groupCount: 4 });
    manager.openQuestion(1);
    manager.openQuestion(1);
    manager.endQuestion(1);
    manager.endQuestion(1);
    expect([...store.current()!.openedAt]).toEqual([[1, 100]]);
    expect([...store.current()!.endedAt]).toEqual([[1, 200]]);
  });

  describe('when the computer clock goes back between opening and ending', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('never records an end earlier than the open (AC-30)', () => {
      manager = managerWith(new SequenceClock());
      manager.createActivity({ groupCount: 4 });
      const now = vi.spyOn(performance, 'now').mockReturnValue(120_000);
      manager.openQuestion(1);
      now.mockReturnValue(60_000);
      manager.endQuestion(1);
      const { openedAt, endedAt } = store.current()!;
      expect(endedAt.get(1)).toBeGreaterThanOrEqual(openedAt.get(1)!);
    });
  });
});
