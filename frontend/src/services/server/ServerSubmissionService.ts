// 001's SubmissionService over 005's server (contracts/submission-api.md): student events through 004's
// RealtimeClient, the teacher list through 002's ApiClient. After a reconnection the server sends nothing
// old, so this service asks again itself (research RD-08).
import type { Judgement, JudgeOutcome, Submission, ValidationError } from '@quiz-buzzer/shared/entities';
import {
  GROUP_SUBMITTED,
  JUDGED,
  OWN,
  SUBMISSIONS_CHANGED,
  SUBMIT,
  type GroupSubmitted,
  type OwnSubmissionReply,
  type SubmissionJudged,
  type SubmissionsChanged,
  type SubmitReply,
  type SubmitRequest,
} from '@quiz-buzzer/shared/submissionEvents';
import type { ApiClient } from '../http/ApiClient';
import type { SubmissionService, Unsubscribe } from '../interfaces';
import type { RealtimeClient } from '../RealtimeClient';

type Listener = (submission: Submission) => void;

export class ServerSubmissionService implements SubmissionService {
  /** The submission of each question still waiting for its ack; a second click gets the same Promise. */
  private readonly inFlight = new Map<number, Promise<Submission | ValidationError>>();
  /** The last request that got no answer (timeout or disconnect); resent with the same requestId (RD-04). */
  private lastRequest: SubmitRequest | null = null;
  /** The question this tab last submitted or asked about; asked again on reconnecting (RD-08). */
  private lastQuestion: number | null = null;
  private readonly submittedListeners = new Set<Listener>();
  private readonly judgementListeners = new Set<Listener>();

  constructor(
    private readonly realtime: Pick<RealtimeClient, 'on' | 'onConnect' | 'emitWithAck' | 'followTeacherCredential'>,
    private readonly api: Pick<ApiClient, 'request'>,
  ) {
    realtime.on<GroupSubmitted>(GROUP_SUBMITTED, ({ submission }) => this.tell(this.submittedListeners, submission));
    realtime.on<SubmissionJudged>(JUDGED, ({ submission }) => this.tell(this.judgementListeners, submission));
    realtime.onConnect(() => void this.catchUp());
  }

  submitAnswer(questionNumber: number, answers: string[]): Promise<Submission | ValidationError> {
    const pending = this.inFlight.get(questionNumber);
    if (pending) return pending;
    this.lastQuestion = questionNumber;
    const request = this.requestFor(questionNumber, answers);
    const sending = this.realtime
      .emitWithAck<SubmitReply>(SUBMIT, request)
      .then((reply) => {
        this.lastRequest = null;
        return reply.ok ? (reply.submission as Submission) : (reply.error as ValidationError);
      })
      .finally(() => this.inFlight.delete(questionNumber));
    this.inFlight.set(questionNumber, sending);
    return sending;
  }

  async getGroupSubmission(questionNumber: number): Promise<Submission | null> {
    this.lastQuestion = questionNumber;
    const reply = await this.realtime.emitWithAck<OwnSubmissionReply>(OWN, { questionNumber });
    return reply.submission;
  }

  onGroupSubmitted(listener: Listener): Unsubscribe {
    this.submittedListeners.add(listener);
    return () => this.submittedListeners.delete(listener);
  }

  onJudgement(listener: Listener): Unsubscribe {
    this.judgementListeners.add(listener);
    return () => this.judgementListeners.delete(listener);
  }

  async listSubmissions(questionNumber: number): Promise<Submission[]> {
    this.realtime.followTeacherCredential();
    return this.api.request<Submission[]>('GET', `/api/questions/${questionNumber}/submissions`);
  }

  onSubmissionsChange(questionNumber: number, listener: (submissions: Submission[]) => void): Unsubscribe {
    this.realtime.followTeacherCredential();
    const stopChanges = this.realtime.on<SubmissionsChanged>(SUBMISSIONS_CHANGED, (payload) => {
      if (payload.questionNumber === questionNumber) listener(payload.submissions);
    });
    // A reconnected teacher tab missed every change in between, so it reads the list again.
    let active = true;
    const stopConnect = this.realtime.onConnect(() => {
      this.listSubmissions(questionNumber).then(
        (submissions) => active && listener(submissions),
        () => {}, // the next change or reconnection brings the list
      );
    });
    return () => {
      active = false;
      stopChanges();
      stopConnect();
    };
  }

  // ponytail: judging is 005 Phase 4 (T023); until then the page shows this in its error area.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async judge(questionNumber: number, groupNumber: number, judgement: Judgement): Promise<JudgeOutcome> {
    throw new Error('判定功能尚未完成（005 Phase 4）');
  }

  /** The same question and answers as the request that got no answer reuse its requestId. */
  private requestFor(questionNumber: number, answers: string[]): SubmitRequest {
    const last = this.lastRequest;
    if (last && last.questionNumber === questionNumber && sameAnswers(last.answers, answers)) return last;
    this.lastRequest = { questionNumber, answers: [...answers], requestId: crypto.randomUUID() };
    return this.lastRequest;
  }

  /** After reconnecting: the group may have submitted or been judged while this tab was away. */
  private async catchUp(): Promise<void> {
    const questionNumber = this.lastQuestion;
    if (questionNumber === null || (this.submittedListeners.size === 0 && this.judgementListeners.size === 0)) return;
    let submission: Submission | null;
    try {
      submission = (await this.realtime.emitWithAck<OwnSubmissionReply>(OWN, { questionNumber })).submission;
    } catch {
      return; // the next reconnection asks again
    }
    if (submission === null) return;
    this.tell(this.submittedListeners, submission);
    if (submission.judgement === 'REJECTED') this.tell(this.judgementListeners, submission);
  }

  private tell(listeners: Set<Listener>, submission: Submission): void {
    for (const listener of [...listeners]) listener(submission);
  }
}

function sameAnswers(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((answer, i) => answer === b[i]);
}
