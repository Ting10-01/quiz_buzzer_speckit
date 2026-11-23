// TEMPORARY interface of 005's SubmissionStore, copied from
// specs/005-buzz-submission/contracts/submission-store.md (the methods 006 uses).
// 005 (server/src/submission/SubmissionStore.ts) is not implemented yet; 006 depends only on this
// shape so it can be built and tested with a substitute. When 005 lands, import SubmissionStore
// from server/src/submission/ instead and delete this file. Types only, no code.
import type { Submission } from '../temp-shared/entities.js';

// The only authoritative source of submissions, ranks and judgements. 006 only reads.
export interface SubmissionStore {
  // Every submission to question n, sorted by rank (teacher view); [] when none.
  list(questionNumber: number): Submission[];
  // The ACCEPTED submission to question n, or null.
  winner(questionNumber: number): Submission | null;
}
