import { GROUP_COUNT_MAX, GROUP_COUNT_MIN } from '@quiz-buzzer/shared/activityRules';
import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { ActivitySettings, ValidationError } from '@quiz-buzzer/shared/entities';
import type { ImportStore } from '../guided-notes/ImportStore.js';
import type { ActivityStore } from './ActivityStore.js';
import { Audience, toActivity } from './ActivityView.js';
import type { CommandQueue } from './CommandQueue.js';
import type { GroupMembership } from './GroupMembership.js';
import type { SequenceClock } from './SequenceClock.js';

/** A rule does not allow the command; REST answers 409 { code, message } (data-model "ActivityRuleError"). */
export class ActivityRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ActivityRuleError';
  }
}

// data-model "ValidationError 的內容".
const GROUP_COUNT_INVALID = `組數必須是 ${GROUP_COUNT_MIN} 到 ${GROUP_COUNT_MAX} 之間的整數`;

/** The groupCount the request asks for, or the ValidationError explaining why it is not allowed. */
function checkGroupCount(settings: unknown, lowest: number): number | ValidationError {
  const groupCount: unknown = (settings as Partial<ActivitySettings> | null)?.groupCount;
  if (typeof groupCount !== 'number' || !Number.isInteger(groupCount) || groupCount < GROUP_COUNT_MIN || groupCount > GROUP_COUNT_MAX) {
    return { field: 'groupCount', message: GROUP_COUNT_INVALID };
  }
  if (groupCount < lowest) {
    return { field: 'groupCount', message: `第 ${lowest} 組已有學生加入，組數不能少於 ${lowest}` };
  }
  return groupCount;
}

const noActivity = () => new ActivityRuleError('NO_ACTIVITY', '目前沒有活動');

// The activity rules (data-model "ActivityManager"). Every command runs inside CommandQueue.run.
export class ActivityManager {
  constructor(
    private readonly queue: CommandQueue,
    private readonly store: ActivityStore,
    private readonly membership: GroupMembership,
    private readonly clock: SequenceClock,
    private readonly importStore: ImportStore,
  ) {}

  /** null -> PREPARING with the questions of the latest import (AC-03). */
  createActivity(settings: ActivitySettings): ActivitySnapshot | ValidationError {
    return this.queue.run(() => {
      if (this.store.current()) {
        throw new ActivityRuleError('ACTIVITY_EXISTS', '已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器');
      }
      const imported = this.importStore.latest();
      if (!imported) throw new ActivityRuleError('NO_IMPORT', '請先匯入學習單');
      const groupCount = checkGroupCount(settings, 0);
      if (typeof groupCount !== 'number') return groupCount;
      this.store.commit({
        spreadsheet: structuredClone(imported.spreadsheet),
        questions: structuredClone(imported.questions),
        groupCount,
        phase: 'PREPARING',
        openedAt: new Map(),
        endedAt: new Map(),
      });
      return this.snapshot(Audience.TEACHER);
    });
  }

  /** Changes the group count while PREPARING; never below a group that has students (AC-05). */
  updateSettings(settings: ActivitySettings): ActivitySnapshot | ValidationError {
    return this.queue.run(() => {
      const state = this.store.current();
      if (!state) throw noActivity();
      if (state.phase !== 'PREPARING') throw new ActivityRuleError('SETTINGS_LOCKED', '第 1 題開放後不能修改設定');
      const groupCount = checkGroupCount(settings, this.membership.highestOccupiedGroup());
      if (typeof groupCount !== 'number') return groupCount;
      this.store.commit({ ...state, groupCount });
      return this.snapshot(Audience.TEACHER);
    });
  }

  /** PREPARING -> no activity, emptying every group; without an activity nothing changes (research RA-17). */
  cancelActivity(): ActivitySnapshot {
    return this.queue.run(() => {
      const state = this.store.current();
      if (state) {
        if (state.phase !== 'PREPARING') throw new ActivityRuleError('CANCEL_LOCKED', '第 1 題開放後不能取消活動');
        this.membership.reset();
        this.store.commit(null);
      }
      return this.snapshot(Audience.TEACHER);
    });
  }

  /** The current state for the audience. Read-only, so it may also be called inside CommandQueue.run. */
  snapshot(audience: Audience): ActivitySnapshot {
    const state = this.store.current();
    return {
      version: this.store.version(),
      activity: state && toActivity(state, this.membership.memberCounts(state.groupCount), audience),
    };
  }
}
