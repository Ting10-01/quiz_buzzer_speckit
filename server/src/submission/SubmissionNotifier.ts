import {
  GROUP_SUBMITTED,
  JUDGED,
  SUBMISSIONS_CHANGED,
  type GroupSubmitted,
  type SubmissionJudged,
  type SubmissionsChanged,
} from '@quiz-buzzer/shared/submissionEvents';
import type { Server } from 'socket.io';
import type { GroupMembership } from '../activity/GroupMembership.js';
import { TEACHER_ROOM } from '../realtime/socketServer.js';
import type { SubmissionRecord, SubmissionStore } from './SubmissionStore.js';
import type { SubmissionVisibility } from './SubmissionVisibility.js';

/** At most one teacher list per question in this window (research RD-05). */
const MERGE_WINDOW_MS = 200;

// Pushes submission changes (research RD-05). Callers are inside 004's CommandQueue.run, so every method
// only schedules with setImmediate and nothing is sent while a command runs (004 RA-04). No emit waits
// for an answer, so a slow connection only holds up its own buffer.
export class SubmissionNotifier {
  /** Questions whose teacher list changed and has not been sent yet. */
  private readonly pending = new Set<number>();
  /** Set while a teacher list was sent less than MERGE_WINDOW_MS ago. */
  private timer?: NodeJS.Timeout;
  private flushScheduled = false;

  constructor(
    private readonly io: Server,
    private readonly store: SubmissionStore,
    private readonly visibility: SubmissionVisibility,
    private readonly membership: GroupMembership,
  ) {}

  /** The teacher list of question n changed (REQ-SUB-10). */
  submissionsChanged(questionNumber: number): void {
    this.pending.add(questionNumber);
    if (this.timer !== undefined || this.flushScheduled) return; // sent when the window ends
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  /** Tells every tab of the group that it has submitted (REQ-SUB-20). */
  groupSubmitted(record: SubmissionRecord): void {
    const payload: GroupSubmitted = { submission: this.visibility.forStudent(record) };
    setImmediate(() => this.sendToGroup(record.groupNumber, GROUP_SUBMITTED, payload));
  }

  /** Tells the group its submission was judged; UNJUDGED is not a judgement (REQ-SUB-15). */
  judged(record: SubmissionRecord): void {
    if (record.judgement === 'UNJUDGED') return;
    const payload: SubmissionJudged = { submission: this.visibility.forStudent(record) };
    setImmediate(() => this.sendToGroup(record.groupNumber, JUDGED, payload));
  }

  /** Sends the newest full list of each pending question, then holds further lists for the window. */
  private flush(): void {
    if (this.pending.size === 0) {
      this.timer = undefined;
      return;
    }
    for (const questionNumber of this.pending) {
      const payload: SubmissionsChanged = { questionNumber, submissions: this.store.list(questionNumber) };
      this.io.to(TEACHER_ROOM).emit(SUBMISSIONS_CHANGED, payload);
    }
    this.pending.clear();
    this.timer = setTimeout(() => this.flush(), MERGE_WINDOW_MS);
  }

  // 004 keeps no group rooms, so the connections are scanned (research RD-05).
  private sendToGroup(groupNumber: number, event: string, payload: unknown): void {
    for (const socket of this.io.sockets.sockets.values()) {
      if (this.membership.groupOf(socket) === groupNumber) socket.emit(event, payload);
    }
  }
}
