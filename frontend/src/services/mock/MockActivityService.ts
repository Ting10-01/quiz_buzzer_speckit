// M3 (teacher-side activity) and M7 (phase seen by the home page and student pages).
// The two are independent: teacher calls change MockSession.teacherActivity, while
// getCurrentActivity / onPhaseChange only follow MockSession.viewerPhaseIndex.
import {
  ActivityPhase,
  type Activity,
  type ActivitySettings,
  type ValidationError,
} from '@quiz-buzzer/shared/entities';
import type {
  ActivityService,
  PhaseMockControl,
  Unsubscribe,
  ValidationMockControl,
} from '../interfaces';
import { MockFixtures } from './MockFixtures';
import { MOCK_UNEXPECTED_ERROR, MOCK_VALIDATION_MESSAGE, type MockSession } from './MockSession';

interface ViewerStep {
  phase: ActivityPhase;
  currentQuestion?: number;
}

/** M7: NO_ACTIVITY → PREPARING → OPEN(1) → QUESTION_ENDED(1) → … → QUESTION_ENDED(last) → FINISHED. */
function viewerSequence(): ViewerStep[] {
  const steps: ViewerStep[] = [
    { phase: ActivityPhase.NO_ACTIVITY },
    { phase: ActivityPhase.PREPARING },
  ];
  for (const question of MockFixtures.activity.questions) {
    steps.push(
      { phase: ActivityPhase.OPEN, currentQuestion: question.number },
      { phase: ActivityPhase.QUESTION_ENDED, currentQuestion: question.number },
    );
  }
  steps.push({ phase: ActivityPhase.FINISHED });
  return steps;
}

export class MockActivityService
  implements ActivityService, PhaseMockControl, ValidationMockControl
{
  private readonly sequence = viewerSequence();
  private readonly phaseListeners = new Set<(activity: Activity) => void>();

  constructor(private readonly session: MockSession) {}

  async createActivity(settings: ActivitySettings): Promise<Activity | ValidationError> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.saveSettings(settings);
  }

  async updateSettings(settings: ActivitySettings): Promise<Activity | ValidationError> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.saveSettings(settings);
  }

  async openQuestion(questionNumber: number): Promise<Activity> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.setTeacherPhase(ActivityPhase.OPEN, questionNumber);
  }

  async endQuestion(questionNumber: number): Promise<Activity> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    const questions = this.requireTeacherActivity().questions;
    const isLast = questions[questions.length - 1]?.number === questionNumber;
    return this.setTeacherPhase(
      isLast ? ActivityPhase.FINISHED : ActivityPhase.QUESTION_ENDED,
      questionNumber,
    );
  }

  async joinGroup(groupNumber: number): Promise<Activity> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    const activity = this.viewerActivity();
    if (!activity) throw new Error('joinGroup() called while there is no activity.');
    this.session.joinedGroup = groupNumber;
    return activity;
  }

  async leaveGroup(): Promise<void> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    this.session.joinedGroup = undefined;
  }

  async getCurrentActivity(): Promise<Activity | null> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.viewerActivity();
  }

  onPhaseChange(listener: (activity: Activity) => void): Unsubscribe {
    this.phaseListeners.add(listener);
    return () => {
      this.phaseListeners.delete(listener);
    };
  }

  /** Member counts are fixed in 001 (M3), so this never notifies. */
  onActivityChange(listener: (activity: Activity) => void): Unsubscribe {
    void listener;
    return () => {};
  }

  async advancePhase(): Promise<Activity> {
    const last = this.sequence.length - 1;
    this.session.viewerPhaseIndex = Math.min(this.session.viewerPhaseIndex + 1, last);
    // The index is at least 1 here, so there is always an activity.
    const activity = this.viewerActivity()!;
    this.phaseListeners.forEach((listener) => listener(structuredClone(activity)));
    return activity;
  }

  failNextValidation(): void {
    this.session.pendingValidationFailure.activity = true;
  }

  private saveSettings(settings: ActivitySettings): Activity | ValidationError {
    if (this.session.pendingValidationFailure.activity) {
      this.session.pendingValidationFailure.activity = false;
      return { field: 'groupCount', message: MOCK_VALIDATION_MESSAGE };
    }
    const source = this.session.lastImport ?? MockFixtures.activity;
    const previous = this.session.teacherActivity;
    this.session.teacherActivity = {
      groupCount: settings.groupCount,
      phase: previous?.phase ?? ActivityPhase.PREPARING,
      currentQuestion: previous?.currentQuestion,
      spreadsheet: structuredClone(source.spreadsheet),
      questions: structuredClone(source.questions),
      groups: Array.from({ length: settings.groupCount }, (_, i) => ({
        number: i + 1,
        memberCount: MockFixtures.groupMembers[i]?.memberCount ?? 0,
      })),
    };
    return structuredClone(this.session.teacherActivity);
  }

  private setTeacherPhase(phase: ActivityPhase, currentQuestion: number): Activity {
    const activity = { ...this.requireTeacherActivity(), phase, currentQuestion };
    this.session.teacherActivity = activity;
    return structuredClone(activity);
  }

  private requireTeacherActivity(): Activity {
    if (!this.session.teacherActivity) {
      throw new Error('No teacher activity; call createActivity() first.');
    }
    return this.session.teacherActivity;
  }

  private viewerActivity(): Activity | null {
    const step = this.sequence[this.session.viewerPhaseIndex];
    if (step.phase === ActivityPhase.NO_ACTIVITY) return null;
    return { ...structuredClone(MockFixtures.activity), ...step };
  }
}
