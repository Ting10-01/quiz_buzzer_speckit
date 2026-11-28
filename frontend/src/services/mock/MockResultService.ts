// M8: results built from MockSession.submissions, and mock write-back.
// "Behind first" uses the earliest submission (rank 1) as the baseline (spec M4, D23).
// Results are not filtered for students in 001; the visibility rules belong to 006.
import { Judgement, type QuestionResult, type WriteBackResult } from '@quiz-buzzer/shared/entities';
import type { ResultService } from '../interfaces';
import { MockFixtures } from './MockFixtures';
import { MOCK_UNEXPECTED_ERROR, type MockSession } from './MockSession';

export class MockResultService implements ResultService {
  constructor(private readonly session: MockSession) {}

  async getQuestionResult(questionNumber: number): Promise<QuestionResult> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.buildResult(questionNumber);
  }

  async getAllResults(): Promise<QuestionResult[]> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    return this.activity().questions.map((q) => this.buildResult(q.number));
  }

  async writeBack(): Promise<WriteBackResult> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    const source = this.session.lastImport ?? this.activity();
    if (!source.spreadsheet.editable) {
      return { ok: false, cellCount: 0, failureReason: '沒有編輯權限，無法寫回' };
    }
    // Only questions with a winner are written, matching the T-WriteBack counts (M8, FR-041).
    const cellCount = source.questions
      .filter((q) => this.buildResult(q.number).winner)
      .reduce((sum, q) => sum + q.subQuestions.length, 0);
    return { ok: true, cellCount };
  }

  private activity() {
    return this.session.teacherActivity ?? MockFixtures.activity;
  }

  private buildResult(questionNumber: number): QuestionResult {
    const submissions = this.session.submissions
      .filter((s) => s.questionNumber === questionNumber)
      .sort((a, b) => a.rank - b.rank)
      .map((s) => ({ ...s, answers: [...s.answers] }));
    const first = submissions[0];
    return {
      questionNumber,
      winner: submissions.find((s) => s.judgement === Judgement.ACCEPTED),
      submissionCount: submissions.length,
      submissions,
      behindFirstMs: submissions.map((s) => s.elapsedMs - first.elapsedMs),
    };
  }
}
