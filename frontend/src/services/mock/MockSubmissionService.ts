// M4 (teacher-side submission list and judging), M5 (student submit, groupmate submit) and
// M6 (simulated judgement). There is deliberately no way for a student to read other groups'
// submissions (FR-054).
import {
  ActivityPhase,
  Judgement,
  type JudgeOutcome,
  type Submission,
  type ValidationError,
} from '@quiz-buzzer/shared/entities';
import type {
  JudgementMockControl,
  SubmissionService,
  TeammateMockControl,
  Unsubscribe,
  ValidationMockControl,
} from '../interfaces';
import { MockFixtures } from './MockFixtures';
import { MOCK_UNEXPECTED_ERROR, MOCK_VALIDATION_MESSAGE, type MockSession } from './MockSession';

export class MockSubmissionService
  implements SubmissionService, JudgementMockControl, TeammateMockControl, ValidationMockControl
{
  private readonly judgementListeners = new Set<(submission: Submission) => void>();
  private readonly groupSubmittedListeners = new Set<(submission: Submission) => void>();
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
    return copy(this.recordGroupSubmission(questionNumber, answers));
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

  /** M4: only the earliest PENDING submission can be judged; accepting ends the question. */
  async judge(
    questionNumber: number,
    groupNumber: number,
    judgement: Judgement,
  ): Promise<JudgeOutcome> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    this.seed(questionNumber);
    const earliest = this.forQuestion(questionNumber)
      .filter((s) => s.judgement === Judgement.PENDING)
      .sort((a, b) => a.rank - b.rank)[0];
    // Pages only enable the earliest PENDING row (FR-032), so anything else is a programming error.
    if (!earliest || earliest.groupNumber !== groupNumber) {
      throw new Error(`Group ${groupNumber} is not the earliest PENDING submission.`);
    }
    const activity = this.session.teacherActivity;
    if (!activity) throw new Error('judge() called before createActivity().');
    earliest.judgement = judgement;
    if (judgement === Judgement.ACCEPTED) {
      const isLast = activity.questions.at(-1)?.number === questionNumber;
      this.session.teacherActivity = {
        ...activity,
        phase: isLast ? ActivityPhase.FINISHED : ActivityPhase.QUESTION_ENDED,
        currentQuestion: questionNumber,
      };
    }
    return {
      submissions: this.snapshot(questionNumber),
      activity: structuredClone(this.session.teacherActivity!),
    };
  }

  async getGroupSubmission(questionNumber: number): Promise<Submission | null> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    const found = this.groupSubmission(this.requireJoinedGroup(), questionNumber);
    return found ? copy(found) : null;
  }

  onGroupSubmitted(listener: (submission: Submission) => void): Unsubscribe {
    this.groupSubmittedListeners.add(listener);
    return () => {
      this.groupSubmittedListeners.delete(listener);
    };
  }

  onJudgement(listener: (submission: Submission) => void): Unsubscribe {
    this.judgementListeners.add(listener);
    return () => {
      this.judgementListeners.delete(listener);
    };
  }

  /** M5: a groupmate submits fixed answers for this tab's group and the current question. */
  async simulateTeammateSubmission(): Promise<Submission> {
    const questionNumber = this.viewerQuestion();
    const answers = MockFixtures.teammateAnswers[questionNumber] ?? [];
    const submission = copy(this.recordGroupSubmission(questionNumber, answers));
    this.groupSubmittedListeners.forEach((listener) => listener(copy(submission)));
    return submission;
  }

  /** M6: judges this group's submission for the current question; accepting advances the phase. */
  async simulateJudgement(judgement: Judgement): Promise<Submission> {
    const target = this.groupSubmission(this.requireJoinedGroup(), this.viewerQuestion());
    if (!target) throw new Error('simulateJudgement() called before this group submitted.');
    target.judgement = judgement;
    const snapshot = copy(target);
    this.judgementListeners.forEach((listener) => listener(copy(snapshot)));
    if (judgement === Judgement.ACCEPTED) this.session.advanceViewerPhase();
    return snapshot;
  }

  failNextValidation(): void {
    this.session.pendingValidationFailure.submission = true;
  }

  /** M5: each group submits once per question, whether by this tab or a groupmate. */
  private recordGroupSubmission(questionNumber: number, answers: string[]): Submission {
    const groupNumber = this.requireJoinedGroup();
    if (this.groupSubmission(groupNumber, questionNumber)) {
      throw new Error(`Group ${groupNumber} already submitted question ${questionNumber}.`);
    }
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
    return submission;
  }

  private requireJoinedGroup(): number {
    const groupNumber = this.session.joinedGroup;
    if (groupNumber === undefined) throw new Error('Called before joinGroup().');
    return groupNumber;
  }

  /** The question the student pages are on (M7). */
  private viewerQuestion(): number {
    const questionNumber = MockFixtures.viewerSequence[this.session.viewerPhaseIndex]?.currentQuestion;
    if (questionNumber === undefined) throw new Error('No question is open for the student.');
    return questionNumber;
  }

  private groupSubmission(groupNumber: number, questionNumber: number): Submission | undefined {
    return this.forQuestion(questionNumber).find((s) => s.groupNumber === groupNumber);
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

  private snapshot(questionNumber: number): Submission[] {
    return this.forQuestion(questionNumber)
      .sort((a, b) => a.rank - b.rank)
      .map(copy);
  }
}

function copy(submission: Submission): Submission {
  return { ...submission, answers: [...submission.answers] };
}
