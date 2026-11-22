// Entity types from diagrams/001-class.puml (package "Entities"), shared by the
// frontend and (from 002 on) the server. Field names follow data-model.md section 1.
// Entities carry no validation rules; those belong to the sub-features that own them.

export const Role = {
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export interface TeacherAccount {
  name: string;
  email: string;
}

export const SignInFailure = {
  CANCELLED: 'CANCELLED',
} as const;
export type SignInFailure = (typeof SignInFailure)[keyof typeof SignInFailure];

export interface SignInResult {
  ok: boolean;
  account?: TeacherAccount;
  failure?: SignInFailure;
}

export interface Spreadsheet {
  id: string;
  title: string;
  editable: boolean;
  worksheets: string[];
  selectedWorksheet: string;
}

export const QuestionType = {
  SINGLE: 'SINGLE',
  GROUP: 'GROUP',
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export interface SubQuestion {
  index: number;
  blankCell: string;
}

/** One numbered question; a single question has exactly one sub-question. */
export interface Question {
  number: number;
  type: QuestionType;
  text?: string;
  subQuestions: SubQuestion[];
}

export interface ImportSuccess {
  spreadsheet: Spreadsheet;
  headerRow: number;
  headerColumns: string[];
  questions: Question[];
}

export interface ImportError {
  code: string;
  reason: string;
  foundHeaders: string[];
  acceptedHeaders: string[];
  fixSteps: string[];
}

export const ActivityPhase = {
  NO_ACTIVITY: 'NO_ACTIVITY',
  PREPARING: 'PREPARING',
  OPEN: 'OPEN',
  QUESTION_ENDED: 'QUESTION_ENDED',
  FINISHED: 'FINISHED',
} as const;
export type ActivityPhase = (typeof ActivityPhase)[keyof typeof ActivityPhase];

/** Activities have no name (FR-023). */
export interface ActivitySettings {
  groupCount: number;
}

export interface Group {
  number: number;
  memberCount: number;
}

/** Activities have no name (FR-023). currentQuestion is set while OPEN or QUESTION_ENDED. */
export interface Activity {
  groupCount: number;
  phase: ActivityPhase;
  currentQuestion?: number;
  spreadsheet: Spreadsheet;
  questions: Question[];
  groups: Group[];
}

export const Judgement = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  UNJUDGED: 'UNJUDGED',
} as const;
export type Judgement = (typeof Judgement)[keyof typeof Judgement];

/** answers follow the order of the question's subQuestions. */
export interface Submission {
  questionNumber: number;
  groupNumber: number;
  answers: string[];
  rank: number;
  elapsedMs: number;
  judgement: Judgement;
}

/** Result of judging one submission: the updated list and the activity after judging (FR-032a). */
export interface JudgeOutcome {
  submissions: Submission[];
  activity: Activity;
}

/** behindFirstMs is computed by the result service, in the same order as submissions. */
export interface QuestionResult {
  questionNumber: number;
  winner?: Submission;
  submissionCount: number;
  submissions: Submission[];
  behindFirstMs: number[];
}

export interface WriteBackResult {
  ok: boolean;
  cellCount: number;
  failureReason?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

/** Rejection value of service promises for unexpected failures (FR-009). */
export interface UnexpectedError {
  message: string;
}
