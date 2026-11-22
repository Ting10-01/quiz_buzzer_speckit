// ServiceRegistry from diagrams/001-class.puml: binds every interface to an implementation.
// Built only by the composition root createServiceRegistry().
import type {
  ActivityService,
  AuthService,
  GuidedNotesService,
  JudgementMockControl,
  MockChoicePrompt,
  PhaseMockControl,
  ResultService,
  SubmissionService,
  UnexpectedErrorMockControl,
  ValidationMockControl,
} from './interfaces';

export interface ServiceRegistry {
  auth: AuthService;
  guidedNotes: GuidedNotesService;
  activity: ActivityService;
  submission: SubmissionService;
  result: ResultService;
  /** Present while `activity` is a mock implementation. */
  phaseControl?: PhaseMockControl;
  /** Present while `submission` is a mock implementation. */
  judgementControl?: JudgementMockControl;
  /** Present while `activity` is a mock implementation. */
  activityValidationControl?: ValidationMockControl;
  /** Present while `submission` is a mock implementation. */
  submissionValidationControl?: ValidationMockControl;
  /** Present while any interface is a mock implementation. */
  unexpectedErrorControl?: UnexpectedErrorMockControl;
  /** Present while `auth` or `guidedNotes` is a mock implementation. */
  choicePrompt?: MockChoicePrompt;
  /** True while any interface is bound to a mock implementation (FR-005). */
  isMockMode(): boolean;
}
