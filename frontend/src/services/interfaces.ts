// Service interfaces from diagrams/001-class.puml (package "Service Interfaces").
// Pages depend only on these; see contracts/service-interfaces.md and contracts/mock-controls.md.
import type {
  Activity,
  ActivitySettings,
  ImportError,
  ImportSuccess,
  JudgeOutcome,
  Judgement,
  QuestionResult,
  SignInResult,
  Spreadsheet,
  Submission,
  TeacherAccount,
  ValidationError,
  WriteBackResult,
} from '@quiz-buzzer/shared/entities';

/** Stops a subscription; pages call it when they unmount. */
export type Unsubscribe = () => void;

export interface AuthService {
  signInWithGoogle(): Promise<SignInResult>;
  getCurrentAccount(): Promise<TeacherAccount | null>;
}

export interface GuidedNotesService {
  pickSpreadsheet(): Promise<Spreadsheet | null>;
  readWorksheet(spreadsheetId: string, worksheet: string): Promise<ImportSuccess | ImportError>;
}

export interface ActivityService {
  createActivity(settings: ActivitySettings): Promise<Activity | ValidationError>;
  updateSettings(settings: ActivitySettings): Promise<Activity | ValidationError>;
  /** Only before question 1 opens (FR-026); afterwards the activity no longer exists. */
  cancelActivity(): Promise<void>;
  openQuestion(questionNumber: number): Promise<Activity>;
  endQuestion(questionNumber: number): Promise<Activity>;
  /** The service remembers this tab's group; later calls never pass a group (principle VI). */
  joinGroup(groupNumber: number): Promise<Activity>;
  leaveGroup(): Promise<void>;
  getCurrentActivity(): Promise<Activity | null>;
  /**
   * Notifies phase changes. `null` means the activity no longer exists because the teacher
   * cancelled it, the same as getCurrentActivity() returning null (research RD-12).
   */
  onPhaseChange(listener: (activity: Activity | null) => void): Unsubscribe;
  onActivityChange(listener: (activity: Activity) => void): Unsubscribe;
}

export interface SubmissionService {
  submitAnswer(questionNumber: number, answers: string[]): Promise<Submission | ValidationError>;
  listSubmissions(questionNumber: number): Promise<Submission[]>;
  onSubmissionsChange(
    questionNumber: number,
    listener: (submissions: Submission[]) => void,
  ): Unsubscribe;
  judge(questionNumber: number, groupNumber: number, judgement: Judgement): Promise<JudgeOutcome>;
  /** This tab's group submission for the question, or null (research RD-14). No group argument (principle VI). */
  getGroupSubmission(questionNumber: number): Promise<Submission | null>;
  /** Notifies when a groupmate submits for this tab's group (FR-056a). */
  onGroupSubmitted(listener: (submission: Submission) => void): Unsubscribe;
  onJudgement(listener: (submission: Submission) => void): Unsubscribe;
}

export interface ResultService {
  getQuestionResult(questionNumber: number): Promise<QuestionResult>;
  getAllResults(): Promise<QuestionResult[]>;
  writeBack(): Promise<WriteBackResult>;
}

// Mock-only interfaces, used by MockModeBadge / MockControlBar, never by pages.

export interface PhaseMockControl {
  advancePhase(): Promise<Activity>;
}

export interface JudgementMockControl {
  simulateJudgement(judgement: Judgement): Promise<Submission>;
}

export interface TeammateMockControl {
  simulateTeammateSubmission(): Promise<Submission>;
}

export interface ValidationMockControl {
  failNextValidation(): void;
}

export interface UnexpectedErrorMockControl {
  failNextCall(): void;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceRequest {
  title: string;
  options: ChoiceOption[];
}

export interface MockChoicePrompt {
  onRequest(listener: (request: ChoiceRequest) => void): Unsubscribe;
  /** Answers the pending request with an option id, or null when the chooser is closed. */
  answer(choiceId: string | null): void;
}
