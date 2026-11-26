import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { Server } from 'socket.io';
import { TEACHER_ROOM } from '../realtime/socketServer.js';
import type { ActivityStore } from './ActivityStore.js';
import { Audience, toActivity } from './ActivityView.js';
import type { GroupMembership } from './GroupMembership.js';

/** Room of every connection opened without a teacher credential. */
export const STUDENTS_ROOM = 'students';

// Pushes `activity:snapshot` after the store changes (research RA-04). A commit only schedules a flush,
// so nothing is sent inside CommandQueue.run, and several commits in one event loop turn send only
// the newest state.
export class ActivityBroadcaster {
  private flushScheduled = false;

  constructor(
    private readonly io: Server,
    private readonly store: ActivityStore,
    private readonly membership: GroupMembership,
  ) {}

  start(): void {
    this.store.subscribe(() => {
      if (this.flushScheduled) return;
      this.flushScheduled = true;
      setImmediate(() => this.flush());
    });
  }

  private flush(): void {
    this.flushScheduled = false;
    this.io.to(TEACHER_ROOM).emit('activity:snapshot', this.snapshot(Audience.TEACHER));
    this.io.to(STUDENTS_ROOM).emit('activity:snapshot', this.snapshot(Audience.PUBLIC));
  }

  private snapshot(audience: Audience): ActivitySnapshot {
    const state = this.store.current();
    return {
      version: this.store.version(),
      activity: state && toActivity(state, this.membership.memberCounts(state.groupCount), audience),
    };
  }
}
