import type { SubmissionRecord } from '../../src/submission/SubmissionStore.js';

// A PENDING record of group 1 for question 1, rank 1, unless overridden.
export function submissionRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    questionNumber: 1,
    groupNumber: 1,
    answers: ['光合作用'],
    rank: 1,
    elapsedMs: 1500,
    judgement: 'PENDING',
    requestId: `request-${overrides.groupNumber ?? 1}-${overrides.rank ?? 1}`,
    acceptedAt: 101500,
    ...overrides,
  };
}
