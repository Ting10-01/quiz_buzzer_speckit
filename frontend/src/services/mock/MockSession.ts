// Per-tab mock state shared by every Mock*Service (data-model section 3, MockSession).
// Reset on reload because it lives only in memory.
import type {
  Activity,
  ImportSuccess,
  Submission,
  UnexpectedError,
} from '@quiz-buzzer/shared/entities';
import type {
  ChoiceRequest,
  MockChoicePrompt,
  Unsubscribe,
  UnexpectedErrorMockControl,
} from '../interfaces';

export const MOCK_UNEXPECTED_ERROR: UnexpectedError = { message: '模擬：連不上伺服器' };
export const MOCK_VALIDATION_MESSAGE = '模擬：驗證失敗';

export class MockSession implements MockChoicePrompt, UnexpectedErrorMockControl {
  lastImport?: ImportSuccess;
  teacherActivity?: Activity;
  joinedGroup?: number;
  viewerPhaseIndex = 0;
  submissions: Submission[] = [];
  pendingValidationFailure = { activity: false, submission: false };
  pendingUnexpectedError = false;

  private viewerPhaseAdvancer?: () => void;
  private readonly requestListeners = new Set<(request: ChoiceRequest) => void>();
  private resolvePending?: (choiceId: string | null) => void;

  /** Shows a mock chooser (M1, M2) through the control bar and waits for answer(). */
  requestChoice(request: ChoiceRequest): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePending = resolve;
      this.requestListeners.forEach((listener) => listener(request));
    });
  }

  onRequest(listener: (request: ChoiceRequest) => void): Unsubscribe {
    this.requestListeners.add(listener);
    return () => {
      this.requestListeners.delete(listener);
    };
  }

  answer(choiceId: string | null): void {
    const resolve = this.resolvePending;
    this.resolvePending = undefined;
    resolve?.(choiceId);
  }

  /** Registered by MockActivityService so M6 advances through the same code as advancePhase(). */
  setViewerPhaseAdvancer(advance: () => void): void {
    this.viewerPhaseAdvancer = advance;
  }

  /** Advances the phase seen by the home page and student pages once (M6). Mock services only. */
  advanceViewerPhase(): void {
    if (!this.viewerPhaseAdvancer) {
      throw new Error('advanceViewerPhase() called before MockActivityService was created.');
    }
    this.viewerPhaseAdvancer();
  }

  failNextCall(): void {
    this.pendingUnexpectedError = true;
  }

  /** Reads and clears the armed unexpected error (M9). Callers reject with MOCK_UNEXPECTED_ERROR when true. */
  consumeUnexpectedError(): boolean {
    const armed = this.pendingUnexpectedError;
    this.pendingUnexpectedError = false;
    return armed;
  }
}
