// Payloads and names of 005's Socket.IO events (data-model section 2). Judging returns 001's
// JudgeOutcome from ./entities; it is not redefined here.
import type { Judgement, Submission, ValidationError } from './entities';

export const SUBMIT = 'submission:submit';
export const OWN = 'submission:own';
export const SUBMISSIONS_CHANGED = 'submissions:changed';
export const GROUP_SUBMITTED = 'submission:groupSubmitted';
export const JUDGED = 'submission:judged';

/** Student → server. No group field: the server takes the group from the connection (REQ-SUB-02). */
export interface SubmitRequest {
  questionNumber: number;
  answers: string[];
  /** A UUID; a resend with the same id is not recorded twice. */
  requestId: string;
}

/** `submission` (student view) when ok; `error` otherwise. */
export interface SubmitReply {
  ok: boolean;
  submission?: Submission;
  error?: ValidationError;
}

/** Student → server: this group's submission for a question. */
export interface OwnSubmissionRequest {
  questionNumber: number;
}

/** Student view; null when the group has not submitted (REQ-SUB-21). */
export interface OwnSubmissionReply {
  submission: Submission | null;
}

/** Teacher → server. Only ACCEPTED and REJECTED are accepted. */
export interface JudgeRequest {
  groupNumber: number;
  judgement: Judgement;
}

/** Server → teachers: the full list, ordered by rank. */
export interface SubmissionsChanged {
  questionNumber: number;
  submissions: Submission[];
}

/** Server → the submitting group; student view (REQ-SUB-20). */
export interface GroupSubmitted {
  submission: Submission;
}

/** Server → the judged group; student view (REQ-SUB-15). */
export interface SubmissionJudged {
  submission: Submission;
}
