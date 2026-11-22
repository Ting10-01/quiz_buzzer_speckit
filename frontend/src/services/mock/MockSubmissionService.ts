// M4 (teacher-side submission list and judging), M5 (student submit) and M6 (simulated judgement).
// There is deliberately no way for a student to read other groups' submissions (FR-054).
import { Judgement, type Submission, type ValidationError } from '@quiz-buzzer/shared/entities';
import type {
  JudgementMockControl,
  SubmissionService,
  Unsubscribe,
  ValidationMockControl,
} from '../interfaces';
import { MockFixtures } from './MockFixtures';
import { MOCK_UNEXPECTED_ERROR, MOCK_VALIDATION_MESSAGE, type MockSession } from './MockSession';

export class MockSubmissionService
  implements SubmissionService, JudgementMockControl, ValidationMockControl
{
  private readonly judgementListeners = new Set<(submission: Submission) => void>();
  /** Questions whose fixture submissions were already copied into MockSession.submissions. */
  private readonly seededQuestions = new Set<number>();

  constructor(private readonly session: MockSession) {}

  async submitAnswer(
    questionNumber: number,
    answers: string[],
  ): Promise<Submission | ValidationError> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    if (this.session.pendingValidationFailure.submission) {
      this.session.pendingValidationFailure.submission = false;
      return { field: 'answers.0', message: MOCK_VALIDATION_MESSAGE };
    }
    const groupNumber = this.session.joinedGroup;
    if (groupNumber === undefined) throw new Error('submitAnswer() called before joinGroup().');
    const submission: Submission = {
      questionNumber,
      groupNumber,
      answers: [...answers],
      rank: this.forQuestion(questionNumber).length + 1,
      // Timing is defined by 005; the mock does not measure it.
      elapsedMs: 0,
      judgement: Judgement.PENDING,
    };
    this.session.submissions.push(submission);
    return { ...submission };
  }

  async listSubmissions(questionNumber: number): Promise<Submission[]> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    this.seed(questionNumber);
    return this.snapshot(questionNumber);
  }

  /** Fixture submissions are fixed in 001 (M4), so this never notifies. */
  onSubmissionsChange(
    questionNumber: number,
    listener: (submissions: Submission[]) => void,
  ): Unsubscribe {
    void questionNumber;
    void listener;
    return () => {};
  }

  async judge(
    questionNumber: number,
    groupNumber: number,
    judgement: Judgement,
  ): Promise<Submission[]> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    this.seed(questionNumber);
    const target = this.latestOf(
      this.forQuestion(questionNumber).filter((s) => s.groupNumber === groupNumber),
    );
    if (target) target.judgement = judgement;
    return this.snapshot(questionNumber);
  }

  onJudgement(listener: (submission: Submission) => void): Unsubscribe {
    this.judgementListeners.add(listener);
    return () => {
      this.judgementListeners.delete(listener);
    };
  }

  async simulateJudgement(judgement: Judgement): Promise<Submission> {
    const groupNumber = this.session.joinedGroup;
    const target = this.latestOf(
      this.session.submissions.filter((s) => s.groupNumber === groupNumber),
    );
    if (!target) throw new Error('simulateJudgement() called before this tab submitted.');
    target.judgement = judgement;
    const snapshot = { ...target, answers: [...target.answers] };
    this.judgementListeners.forEach((listener) => listener({ ...snapshot }));
    return snapshot;
  }

  failNextValidation(): void {
    this.session.pendingValidationFailure.submission = true;
  }

  private seed(questionNumber: number): void {
    if (this.seededQuestions.has(questionNumber)) return;
    this.seededQuestions.add(questionNumber);
    const spreadsheetId = (this.session.teacherActivity ?? MockFixtures.activity).spreadsheet.id;
    const rows = MockFixtures.submissionsByQuestion[spreadsheetId]?.[questionNumber] ?? [];
    const offset = this.forQuestion(questionNumber).length;
    rows.forEach((row, i) => {
      this.session.submissions.push({
        questionNumber,
        groupNumber: row.groupNumber,
        answers: [...row.answers],
        rank: offset + i + 1,
        elapsedMs: row.elapsedMs,
        judgement: Judgement.PENDING,
      });
    });
  }

  private forQuestion(questionNumber: number): Submission[] {
    return this.session.submissions.filter((s) => s.questionNumber === questionNumber);
  }

  private latestOf(submissions: Submission[]): Submission | undefined {
    return submissions.reduce<Submission | undefined>(
      (latest, s) => (!latest || s.rank > latest.rank ? s : latest),
      undefined,
    );
  }

  private snapshot(questionNumber: number): Submission[] {
    return this.forQuestion(questionNumber)
      .sort((a, b) => a.rank - b.rank)
      .map((s) => ({ ...s, answers: [...s.answers] }));
  }
}
