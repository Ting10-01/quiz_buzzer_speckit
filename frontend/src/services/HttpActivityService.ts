// 001's ActivityService over 004's server (contracts/activity-service.md): teacher commands through
// 002's ApiClient, pushes and student events through RealtimeClient. Only snapshots with a newer
// version are taken, so the page never goes back to an older state (REQ-ACT-14, AC-24).
import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { Activity, ValidationError } from '@quiz-buzzer/shared/entities';
import type { ApiClient } from './http/ApiClient';
import type { ActivityService, Unsubscribe } from './interfaces';
import type { RealtimeClient } from './RealtimeClient';

const SNAPSHOT_TIMEOUT_MS = 5000;
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';

type Waiter = (activity: Activity | null) => void;

export class HttpActivityService implements ActivityService {
  /** The newest snapshot this tab has; cleared on every (re)connection. */
  private latest: ActivitySnapshot | null = null;
  /** phase:currentQuestion:groupCount of the last onPhaseChange; kept across reconnections. */
  private lastPhaseKey: string | null = null;
  private readonly phaseListeners = new Set<(activity: Activity | null) => void>();
  private readonly activityListeners = new Set<(activity: Activity) => void>();
  private readonly waiters = new Set<Waiter>();

  constructor(
    private readonly realtime: Pick<
      RealtimeClient,
      'on' | 'onConnect' | 'emitWithAck' | 'studentToken' | 'setStudentToken' | 'reconnect'
    >,
    private readonly api: Pick<ApiClient, 'request'>,
  ) {
    // The server may have restarted and count versions from 0 again, so the next snapshot always wins.
    realtime.onConnect(() => {
      this.latest = null;
    });
    realtime.on<ActivitySnapshot>('activity:snapshot', (snapshot) => this.apply(snapshot));
  }

  createActivity(): Promise<Activity | ValidationError> {
    return notYet();
  }

  updateSettings(): Promise<Activity | ValidationError> {
    return notYet();
  }

  cancelActivity(): Promise<void> {
    return notYet();
  }

  openQuestion(): Promise<Activity> {
    return notYet();
  }

  endQuestion(): Promise<Activity> {
    return notYet();
  }

  joinGroup(): Promise<Activity> {
    return notYet();
  }

  leaveGroup(): Promise<void> {
    return notYet();
  }

  /** From the snapshot the server sends on connect (REQ-ACT-15); no extra request (research RA-09). */
  getCurrentActivity(): Promise<Activity | null> {
    if (this.latest) return Promise.resolve(this.latest.activity);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = (activity) => {
        clearTimeout(timer);
        resolve(activity);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(SERVER_UNREACHABLE));
      }, SNAPSHOT_TIMEOUT_MS);
      this.waiters.add(waiter);
    });
  }

  onPhaseChange(listener: (activity: Activity | null) => void): Unsubscribe {
    this.phaseListeners.add(listener);
    return () => {
      this.phaseListeners.delete(listener);
    };
  }

  onActivityChange(listener: (activity: Activity) => void): Unsubscribe {
    this.activityListeners.add(listener);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  /** Takes the snapshot when it is newer (or the first since connecting) and notifies; see the contract. */
  private apply(snapshot: ActivitySnapshot): boolean {
    if (this.latest && snapshot.version <= this.latest.version) return false;
    this.latest = snapshot;
    const { activity } = snapshot;

    for (const waiter of [...this.waiters]) waiter(activity);
    this.waiters.clear();

    if (activity) {
      for (const listener of [...this.activityListeners]) listener(activity);
      const key = `${activity.phase}:${activity.currentQuestion ?? ''}:${activity.groupCount}`;
      if (key !== this.lastPhaseKey) {
        this.lastPhaseKey = key;
        for (const listener of [...this.phaseListeners]) listener(activity);
      }
    } else if (this.lastPhaseKey !== null) {
      // The activity was cancelled, possibly while this tab was disconnected (001 RD-12).
      this.lastPhaseKey = null;
      for (const listener of [...this.phaseListeners]) listener(null);
    }
    return true;
  }
}

// Commands arrive with the user stories that own them (tasks T028, T034, T041, T060); their
// parameters are added then.
function notYet<T>(): Promise<T> {
  return Promise.reject(new Error('尚未實作'));
}
