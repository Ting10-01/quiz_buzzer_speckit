import type { Submission } from '@quiz-buzzer/shared/entities';
import type { SubmissionRecord } from './SubmissionStore.js';

// What each audience may see of a record (REQ-SUB-16, research RD-06). The real rank tells whether
// other groups have submitted, so students always get 0 until 001 makes Submission.rank optional (T035).
export class SubmissionVisibility {
  forTeacher(record: SubmissionRecord): Submission {
    return {
      questionNumber: record.questionNumber,
      groupNumber: record.groupNumber,
      answers: [...record.answers],
      rank: record.rank,
      elapsedMs: record.elapsedMs,
      judgement: record.judgement,
    };
  }

  forStudent(record: SubmissionRecord): Submission {
    return { ...this.forTeacher(record), rank: 0 };
  }
}
