import type { ActivityState, ActivityStore } from '../activity/index.js';
import type { SubmissionStore } from '../submission/index.js';
import type { QuestionResult, Submission } from '@quiz-buzzer/shared/entities';

export const ResultQueryErrorCode = {
  NO_ACTIVITY: 'NO_ACTIVITY',
  QUESTION_NOT_FOUND: 'QUESTION_NOT_FOUND',
  QUESTION_NOT_ENDED: 'QUESTION_NOT_ENDED',
} as const;
export type ResultQueryErrorCode = (typeof ResultQueryErrorCode)[keyof typeof ResultQueryErrorCode];

const MESSAGES: Record<ResultQueryErrorCode, string> = {
  NO_ACTIVITY: '目前沒有活動',
  QUESTION_NOT_FOUND: '沒有這一題',
  QUESTION_NOT_ENDED: '這一題還沒結束，結果尚未公布',
};

export class ResultQueryError extends Error {
  constructor(readonly code: ResultQueryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ResultQueryError';
  }
}

// Hidden rank: the rank stays private until the whole activity finishes (research RD-02).
function hideRank(submission: Submission): Submission {
  return { ...submission, rank: 0 };
}

// Builds every QuestionResult from 004's and 005's authoritative state on each call (nothing is
// stored, constitution V) and filters it for the viewer on the server (constitution VI).
export class ResultQuery {
  constructor(
    private readonly activities: Pick<ActivityStore, 'current'>,
    private readonly submissions: Pick<SubmissionStore, 'list' | 'winner'>,
  ) {}

  questionResult(questionNumber: number, viewerGroup: number | null): QuestionResult {
    const state = this.activities.current();
    if (!state) throw new ResultQueryError('NO_ACTIVITY');
    if (!state.questions.some((q) => q.number === questionNumber)) throw new ResultQueryError('QUESTION_NOT_FOUND');
    if (!this.isEnded(state, questionNumber)) throw new ResultQueryError('QUESTION_NOT_ENDED');
    return this.visible(this.full(questionNumber), state.phase === 'FINISHED', viewerGroup);
  }

  // Ended questions only, in question order, each filtered like questionResult.
  allResults(viewerGroup: number | null): QuestionResult[] {
    const state = this.activities.current();
    if (!state) throw new ResultQueryError('NO_ACTIVITY');
    const finished = state.phase === 'FINISHED';
    return state.questions
      .filter((q) => this.isEnded(state, q.number))
      .map((q) => this.visible(this.full(q.number), finished, viewerGroup));
  }

  // research RD-03: 004 finishes the activity when the last question ends or is accepted.
  private isEnded(state: ActivityState, questionNumber: number): boolean {
    return state.phase === 'FINISHED' || state.endedAt.has(questionNumber);
  }

  // The teacher view after the activity: all submissions by rank; the gap to the earliest
  // submission (rank 1) is "behind the first" (001 D23, research RD-12).
  private full(questionNumber: number): QuestionResult {
    const list = this.submissions.list(questionNumber);
    const winner = this.submissions.winner(questionNumber);
    const first = list[0]?.elapsedMs ?? 0;
    return {
      questionNumber,
      ...(winner ? { winner } : {}),
      submissionCount: list.length,
      submissions: list,
      behindFirstMs: list.map((s) => s.elapsedMs - first),
    };
  }

  // research RD-02: before the activity finishes, only the viewer's own submission is added and
  // ranks and gaps are 0; the teacher and connections without a group get no submissions.
  private visible(full: QuestionResult, finished: boolean, viewerGroup: number | null): QuestionResult {
    if (finished) return full;
    const own = full.submissions.filter((s) => s.groupNumber === viewerGroup);
    return {
      questionNumber: full.questionNumber,
      ...(full.winner ? { winner: hideRank(full.winner) } : {}),
      submissionCount: full.submissionCount,
      submissions: own.map(hideRank),
      behindFirstMs: own.map(() => 0),
    };
  }
}
