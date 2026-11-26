// 001's ActivityService over 004's server (contracts/activity-service.md): teacher commands through
// 002's ApiClient, pushes and student events through RealtimeClient. Only snapshots with a newer
// version are taken, so the page never goes back to an older state (REQ-ACT-14, AC-24).
import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Activity, ActivitySettings, ValidationError } from '@quiz-buzzer/shared/entities';
import { isValidationError } from '@quiz-buzzer/shared/guards';
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
    > &
      // Optional until T050's tests (Phase 7) give the unit-test fake this method.
      Partial<Pick<RealtimeClient, 'followTeacherCredential'>>,
    private readonly api: Pick<ApiClient, 'request'>,
  ) {
    // The server may have restarted and count versions from 0 again, so the next snapshot always wins.
    realtime.onConnect(() => {
      this.latest = null;
    });
    realtime.on<ActivitySnapshot>('activity:snapshot', (snapshot) => this.apply(snapshot));
  }

  createActivity(settings: ActivitySettings): Promise<Activity | ValidationError> {
    this.followTeacherCredential();
    return this.saveSettings('POST', '/api/activity', settings);
  }

  updateSettings(settings: ActivitySettings): Promise<Activity | ValidationError> {
    this.followTeacherCredential();
    return this.saveSettings('PUT', '/api/activity/settings', settings);
  }

  /** Applies { activity: null } before resolving, so onPhaseChange(null) has run (001 RD-12). */
  async cancelActivity(): Promise<void> {
    this.followTeacherCredential();
    this.apply(await this.api.request<ActivitySnapshot>('DELETE', '/api/activity'));
  }

  openQuestion(questionNumber: number): Promise<Activity> {
    return this.questionCommand(`/api/activity/questions/${questionNumber}/open`);
  }

  /** The answer is QUESTION_ENDED, or FINISHED for the last question (REQ-ACT-06). */
  endQuestion(questionNumber: number): Promise<Activity> {
    return this.questionCommand(`/api/activity/questions/${questionNumber}/end`);
  }

  /**
   * Stores this tab's student identity so a refreshed tab is the same student (REQ-ACT-13). A refusal
   * still carries the current snapshot, which is applied before rejecting (contracts/activity-service.md).
   */
  async joinGroup(groupNumber: number): Promise<Activity> {
    const ack = await this.realtime.emitWithAck<GroupAck>('group:join', { groupNumber });
    if (ack.error) {
      this.apply(ack.snapshot);
      throw new Error(ack.error.message);
    }
    if (ack.studentToken) this.realtime.setStudentToken(ack.studentToken);
    return this.activityAfter(ack.snapshot);
  }

  async leaveGroup(): Promise<void> {
    const ack = await this.realtime.emitWithAck<GroupAck>('group:leave', {});
    if (ack.error) throw new Error(ack.error.message);
    this.apply(ack.snapshot);
  }

  /** From the snapshot the server sends on connect (REQ-ACT-15); no extra request (research RA-09). */
  getCurrentActivity(): Promise<Activity | null> {
    this.followTeacherCredential();
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

  /**
   * A tab that signed in after connecting reconnects as the teacher first; what it had is the
   * student snapshot, so it waits for the next one (contracts/activity-service.md, T062).
   */
  private followTeacherCredential(): void {
    if (this.realtime.followTeacherCredential?.()) this.latest = null;
  }

  /** A ValidationError comes back as a 200 body and changes nothing; ApiError rejects as it is (RA-10). */
  private async saveSettings(method: string, path: string, settings: ActivitySettings): Promise<Activity | ValidationError> {
    const body = await this.api.request<ActivitySnapshot | ValidationError>(method, path, settings);
    if (isValidationError(body)) return body;
    return this.activityAfter(body);
  }

  /** ApiError (409 QUESTION_NOT_NEXT / QUESTION_NOT_OPEN, 401, NETWORK) rejects as it is (RA-10). */
  private async questionCommand(path: string): Promise<Activity> {
    this.followTeacherCredential();
    return this.activityAfter(await this.api.request<ActivitySnapshot>('POST', path));
  }

  /**
   * The command's own result, applied when newer. The page needs the activity the command made even
   * when a newer push already arrived; that push stays the latest snapshot (AC-24).
   */
  private activityAfter(snapshot: ActivitySnapshot): Activity {
    this.apply(snapshot);
    // Every successful command but cancelActivity answers an activity.
    if (!snapshot.activity) throw new Error('伺服器回應格式錯誤');
    return snapshot.activity;
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
