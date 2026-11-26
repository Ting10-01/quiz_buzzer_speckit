import type { ActivityPhase, Question, Spreadsheet } from '@quiz-buzzer/shared/entities';

/** Stops a subscription. */
export type Unsubscribe = () => void;

/** The authoritative activity (data-model "ActivityState"). No activity is `null`, never NO_ACTIVITY. */
export interface ActivityState {
  spreadsheet: Spreadsheet;
  questions: Question[];
  groupCount: number;
  phase: Exclude<ActivityPhase, 'NO_ACTIVITY'>;
  /** Unset while PREPARING; the last question when FINISHED. */
  currentQuestion?: number;
  /** Question number -> SequenceClock time it opened (005 computes elapsed time from it). */
  openedAt: Map<number, number>;
  /** Question number -> SequenceClock time it ended (006 shows it). */
  endedAt: Map<number, number>;
}

// The single source of the activity state (principle V). Only ActivityManager commits, inside
// CommandQueue.run; 005 and 006 only read current() (contracts/server-modules.md).
export class ActivityStore {
  private state: ActivityState | null = null;
  private currentVersion = 0;
  private readonly listeners = new Set<(version: number) => void>();

  current(): Readonly<ActivityState> | null {
    return this.state;
  }

  version(): number {
    return this.currentVersion;
  }

  /**
   * Replaces the state (null cancels the activity) and adds 1 to the version, even for the same
   * state when only member counts changed (REQ-ACT-14). Listeners run synchronously.
   */
  commit(next: ActivityState | null): number {
    this.state = next;
    this.currentVersion++;
    for (const listener of [...this.listeners]) listener(this.currentVersion);
    return this.currentVersion;
  }

  /** Listeners only schedule work; they never send anything over the network (research RA-04). */
  subscribe(listener: (version: number) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
