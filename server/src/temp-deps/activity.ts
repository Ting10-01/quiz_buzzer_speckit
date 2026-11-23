// TEMPORARY interfaces of 004's server modules, copied from
// specs/004-buzzer-session/contracts/server-modules.md and data-model.md (ActivityState).
// 004 (server/src/activity/) is not implemented yet; 006 depends only on these shapes so it can
// be built and tested with substitutes. When 004 lands, import ActivityStore, ActivityState and
// GroupMembership from server/src/activity/ instead and delete this file. Types only, no code.
import type { ActivityPhase, Question, Spreadsheet } from '../temp-shared/entities.js';

export type Unsubscribe = () => void;

// A Socket.IO `Socket` satisfies this; GroupMembership does not depend on Socket.IO.
export interface SocketRef {
  id: string;
}

// The authoritative activity state. Without an activity, ActivityStore.current() is null
// (NO_ACTIVITY is never used here).
export interface ActivityState {
  spreadsheet: Spreadsheet;
  questions: Question[];
  groupCount: number;
  phase: Exclude<ActivityPhase, 'NO_ACTIVITY'>;
  currentQuestion?: number;
  // Question number -> time the question was opened (SequenceClock.stamp()).
  openedAt: Map<number, number>;
  // Question number -> time the question ended.
  endedAt: Map<number, number>;
}

// 005 and 006 only read: never commit.
export interface ActivityStore {
  current(): ActivityState | null;
  version(): number;
  subscribe(listener: () => void): Unsubscribe;
}

// The group of a connection, decided by the server (constitution VI); null when it has not joined.
export interface GroupMembership {
  groupOf(socket: SocketRef): number | null;
}
