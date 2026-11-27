import type { Submission, ValidationError } from '@quiz-buzzer/shared/entities';
import type { SubmitReply, SubmitRequest } from '@quiz-buzzer/shared/submissionEvents';
import type { ActivityManager } from '../activity/ActivityManager.js';
import type { ActivityStore } from '../activity/ActivityStore.js';
import type { SequenceClock } from '../activity/SequenceClock.js';
import type { SubmissionNotifier } from './SubmissionNotifier.js';
import type { SubmissionRecord, SubmissionStore } from './SubmissionStore.js';
import type { SubmissionVisibility } from './SubmissionVisibility.js';

// Submission and judging rules (data-model section 4). Every method runs inside 004's CommandQueue.run,
// so it is synchronous, only changes SubmissionStore and leaves sending to SubmissionNotifier.
// judge is added by US2 (T021).
const ANSWER_MAX_LENGTH = 200;
const NOT_JOINED: ValidationError = { field: 'answers', message: '請先加入組別' };
const BAD_FORMAT: ValidationError = { field: 'answers', message: '送出的資料格式不正確' };
const NOT_OPEN: ValidationError = { field: 'answers', message: '這一題目前不能作答' };
const ALREADY_SUBMITTED: ValidationError = { field: 'answers', message: '本組已送出此題' };

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
   * A student's submission (contracts/submission-api.md section 1). `group` comes from the connection,
   * never from the payload. The same requestId again answers the first result without a new record.
   */
  submit(group: number | null, request: SubmitRequest): SubmitReply {
    this.processed++;
    const error = this.validate(group, request);
    if (error === ALREADY_SUBMITTED) {
      const first = this.submissions.question(request.questionNumber)!.byGroup(group as number)!;
      if (first.requestId === request.requestId) return { ok: true, submission: this.visibility.forStudent(first) };
    }
    if (error !== null) return { ok: false, error };

    const accepted = group as number;
    const { questionNumber, requestId } = request;
    const acceptedAt = this.clock.stamp();
    const openedAt = this.activityStore.current()?.openedAt.get(questionNumber) ?? acceptedAt;
    const record: SubmissionRecord = {
      questionNumber,
      groupNumber: accepted,
      answers: request.answers.map((answer) => answer.trim()),
      rank: (this.submissions.question(questionNumber)?.records.length ?? 0) + 1,
      elapsedMs: Math.round(acceptedAt - openedAt),
      judgement: 'PENDING',
      requestId,
      acceptedAt,
    };
    this.submissions.append(record);
    this.notifier.groupSubmitted(record);
    this.notifier.submissionsChanged(questionNumber);
    return { ok: true, submission: this.visibility.forStudent(record) };
  }

  /** The checks of submit in data-model order; the first error, or null when it can be accepted. */
  validate(group: number | null, request: SubmitRequest): ValidationError | null {
    if (group === null) return NOT_JOINED;
    if (!isWellFormed(request)) return BAD_FORMAT;
    const state = this.activityStore.current();
    if (state?.phase !== 'OPEN' || state.currentQuestion !== request.questionNumber) return NOT_OPEN;
    if (this.submissions.question(request.questionNumber)?.byGroup(group) !== undefined) return ALREADY_SUBMITTED;

    const question = state.questions.find((q) => q.number === request.questionNumber);
    if (question === undefined || request.answers.length !== question.subQuestions.length) return BAD_FORMAT;
    const answers = request.answers.map((answer) => answer.trim());
    const blank = answers.findIndex((answer) => answer === '');
    if (blank !== -1) return { field: `answers.${blank}`, message: '每一格都填才能送出' };
    const tooLong = answers.findIndex((answer) => [...answer].length > ANSWER_MAX_LENGTH);
    if (tooLong !== -1) return { field: `answers.${tooLong}`, message: `每一格最多 ${ANSWER_MAX_LENGTH} 字` };
    return null;
  }

  /** This group's submission of question n in the student view; null without a group or a record (REQ-SUB-21). */
  ownSubmission(group: number | null, questionNumber: number): Submission | null {
    if (group === null) return null;
    const record = this.submissions.question(questionNumber)?.byGroup(group);
    return record === undefined ? null : this.visibility.forStudent(record);
  }

  /**
   * ActivityStore listener, called inside CommandQueue.run on every commit. When the question that was
   * open no longer is (ended, finished, the next one opened, or the activity cancelled), it is closed
   * and the teacher list is refreshed (REQ-SUB-14). When the activity disappears its submissions go too.
   */
  onActivityChange(_version: number): void {
    const open = this.currentOpenQuestion();
    const previous = this.openQuestion;
    this.openQuestion = open;
    if (previous !== null && previous !== open) {
      this.submissions.closeQuestion(previous);
      this.notifier.submissionsChanged(previous);
    }
    // A new activity starts without the old one's submissions (spec Edge Cases 活動消失).
    if (this.activityStore.current() === null) this.submissions.clear();
  }

  private currentOpenQuestion(): number | null {
    const state = this.activityStore.current();
    return state?.phase === 'OPEN' && state.currentQuestion !== undefined ? state.currentQuestion : null;
  }
}

function isWellFormed(request: unknown): request is SubmitRequest {
  if (typeof request !== 'object' || request === null) return false;
  const { questionNumber, answers, requestId } = request as Partial<Record<keyof SubmitRequest, unknown>>;
  return (
    typeof questionNumber === 'number' &&
    Number.isInteger(questionNumber) &&
    questionNumber > 0 &&
    Array.isArray(answers) &&
    answers.every((answer) => typeof answer === 'string') &&
    typeof requestId === 'string'
  );
}
