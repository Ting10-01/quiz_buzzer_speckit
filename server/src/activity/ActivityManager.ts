import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { ImportStore } from '../guided-notes/ImportStore.js';
import type { ActivityStore } from './ActivityStore.js';
import { toActivity, type Audience } from './ActivityView.js';
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

// The activity rules (data-model "ActivityManager"). Every command runs inside CommandQueue.run.
export class ActivityManager {
  constructor(
    private readonly queue: CommandQueue,
    private readonly store: ActivityStore,
    private readonly membership: GroupMembership,
    private readonly clock: SequenceClock,
    private readonly importStore: ImportStore,
  ) {}

  /** The current state for the audience. Read-only, so it may also be called inside CommandQueue.run. */
  snapshot(audience: Audience): ActivitySnapshot {
    const state = this.store.current();
    return {
      version: this.store.version(),
      activity: state && toActivity(state, this.membership.memberCounts(state.groupCount), audience),
    };
  }
}
