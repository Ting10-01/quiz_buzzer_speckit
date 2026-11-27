import type { ActivityManager } from '../activity/ActivityManager.js';
import type { ActivityStore } from '../activity/ActivityStore.js';
import type { SequenceClock } from '../activity/SequenceClock.js';
import type { SubmissionNotifier } from './SubmissionNotifier.js';
import type { SubmissionStore } from './SubmissionStore.js';
import type { SubmissionVisibility } from './SubmissionVisibility.js';

// Submission and judging rules (data-model section 4). Every method runs inside 004's CommandQueue.run,
// so it is synchronous, only changes SubmissionStore and leaves sending to SubmissionNotifier.
// submit, ownSubmission and judge are added by the user story phases (T015, T021).
export class SubmissionEngine {
  /** Each processed submission adds 1, whatever the result; logged as `seq` (research RD-01). */
  protected processed = 0;
  /** The question that was OPEN at the last activity change. */
  private openQuestion: number | null;

  constructor(
    private readonly submissions: SubmissionStore,
    private readonly visibility: SubmissionVisibility,
    private readonly notifier: SubmissionNotifier,
    private readonly activityStore: ActivityStore,
    private readonly activityManager: ActivityManager,
    private readonly clock: SequenceClock,
  ) {
    this.openQuestion = this.currentOpenQuestion();
  }

  /**
   * ActivityStore listener, called inside CommandQueue.run on every commit. When the question that was
   * open no longer is (ended, finished, the next one opened, or the activity cancelled), it is closed
   * and the teacher list is refreshed (REQ-SUB-14).
   */
  onActivityChange(_version: number): void {
    const open = this.currentOpenQuestion();
    const previous = this.openQuestion;
    this.openQuestion = open;
    if (previous === null || previous === open) return;
    this.submissions.closeQuestion(previous);
    this.notifier.submissionsChanged(previous);
  }

  private currentOpenQuestion(): number | null {
    const state = this.activityStore.current();
    return state?.phase === 'OPEN' && state.currentQuestion !== undefined ? state.currentQuestion : null;
  }
}
