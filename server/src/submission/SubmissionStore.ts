import type { Judgement, Submission } from '@quiz-buzzer/shared/entities';
import { SubmissionVisibility } from './SubmissionVisibility.js';

/** One accepted submission (data-model section 4). Only `judgement` changes after it is created. */
export interface SubmissionRecord {
  questionNumber: number;
  groupNumber: number;
  /** Trimmed, one per sub-question. */
  answers: string[];
  /** 1, 2, 3 ... per question, in the order the CommandQueue processed them (REQ-SUB-08). */
  rank: number;
  /** acceptedAt − ActivityState.openedAt[n] (REQ-SUB-09). */
  elapsedMs: number;
  judgement: Judgement;
  /** Recognises the same submission arriving again (REQ-SUB-06). */
  requestId: string;
  /** 004 SequenceClock.stamp(). */
  acceptedAt: number;
}

/** The submissions of one question; created with its first submission. */
export class QuestionSubmissions {
  readonly records: SubmissionRecord[] = [];
  winnerGroup?: number;
  closed = false;

  constructor(readonly questionNumber: number) {}

  /** Each group has at most one record per question. */
  byGroup(groupNumber: number): SubmissionRecord | undefined {
    return this.records.find((record) => record.groupNumber === groupNumber);
  }

  /** The only record the teacher may judge (REQ-SUB-11). */
  firstPending(): SubmissionRecord | undefined {
    return this.records.find((record) => record.judgement === 'PENDING');
  }
}

// The single source of submissions, ranks and judgements (principle V); in memory only. Changed only
// inside 004's CommandQueue.run; 006 reads list and winner (contracts/submission-store.md).
export class SubmissionStore {
  private readonly questions = new Map<number, QuestionSubmissions>();
  private readonly visibility = new SubmissionVisibility();

  question(questionNumber: number): QuestionSubmissions | undefined {
    return this.questions.get(questionNumber);
  }

  append(record: SubmissionRecord): void {
    let question = this.questions.get(record.questionNumber);
    if (question === undefined) {
      question = new QuestionSubmissions(record.questionNumber);
      this.questions.set(record.questionNumber, question);
    }
    const at = question.records.findIndex((existing) => existing.rank > record.rank);
    question.records.splice(at === -1 ? question.records.length : at, 0, record);
  }

  /** The question ended: nothing more can be judged, so waiting records become UNJUDGED (REQ-SUB-14). */
  closeQuestion(questionNumber: number): void {
    const question = this.questions.get(questionNumber);
    if (question === undefined) return;
    question.closed = true;
    for (const record of question.records) {
      if (record.judgement === 'PENDING') record.judgement = 'UNJUDGED';
    }
  }

  /** The activity disappeared: nothing of it is kept, as after a restart (spec Edge Cases). */
  clear(): void {
    this.questions.clear();
  }

  /** Teacher view, ordered by rank; [] when the question has no submissions. */
  list(questionNumber: number): Submission[] {
    return (this.questions.get(questionNumber)?.records ?? []).map((record) => this.visibility.forTeacher(record));
  }

  winner(questionNumber: number): Submission | null {
    const accepted = this.questions.get(questionNumber)?.records.find((record) => record.judgement === 'ACCEPTED');
    return accepted === undefined ? null : this.visibility.forTeacher(accepted);
  }
}
