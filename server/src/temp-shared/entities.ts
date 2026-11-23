// TEMPORARY copy of the 001 entities (specs/001-ui-prototype/data-model.md, section 1).
// It exists only until 001 T012 implements `shared/src/entities.ts`. When that lands,
// 002 T001 adds `server` to the root workspaces, every import switches to
// `@quiz-buzzer/shared`, and this file is deleted. Do not add server-only types here.
// The one 002 change is `SignInFailure.SCOPE_DENIED` (001 data-model: other failure
// kinds are added by 002; 002 T023 makes the same change in `shared/`).
// Enums follow 001 T012: an `as const` object plus a type of the same name.

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
  SCOPE_DENIED: 'SCOPE_DENIED',
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

export interface ActivitySettings {
  groupCount: number;
}

export interface Group {
  number: number;
  memberCount: number;
}

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

export interface Submission {
  questionNumber: number;
  groupNumber: number;
  answers: string[];
  rank: number;
  elapsedMs: number;
  judgement: Judgement;
}

export interface QuestionResult {
  questionNumber: number;
  winner?: Submission;
  submissionCount: number;
  behindFirstMs: number[];
  submissions: Submission[];
}

export interface WriteBackResult {
  ok: boolean;
  cellCount: number;
  failureReason?: string;
}

export interface JudgeOutcome {
  submissions: Submission[];
  activity: Activity;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface UnexpectedError {
  message: string;
}
