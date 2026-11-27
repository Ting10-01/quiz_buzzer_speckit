import { describe, expect, it } from 'vitest';
import { SubmissionStore } from '../../../src/submission/SubmissionStore.js';
import { submissionRecord } from '../../helpers/submissionRecord.js';

// data-model section 4 "SubmissionStore", "QuestionSubmissions"; contracts/submission-store.md.
describe('SubmissionStore', () => {
  it('has no question and an empty list before anything is appended', () => {
    const store = new SubmissionStore();
    expect(store.question(1)).toBeUndefined();
    expect(store.list(1)).toEqual([]);
    expect(store.winner(1)).toBeNull();
  });

  it('creates the question on the first append', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ questionNumber: 2, groupNumber: 3 }));
    const question = store.question(2);
    expect(question?.questionNumber).toBe(2);
    expect(question?.closed).toBe(false);
    expect(question?.winnerGroup).toBeUndefined();
    expect(question?.records).toHaveLength(1);
    expect(store.question(1)).toBeUndefined();
  });

  it('lists the teacher view ordered by rank, without requestId or acceptedAt', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ groupNumber: 4, rank: 2, elapsedMs: 2100, answers: ['葉綠體'] }));
    store.append(submissionRecord({ groupNumber: 2, rank: 1, elapsedMs: 1500, answers: ['光合作用'] }));
    store.append(submissionRecord({ groupNumber: 1, rank: 3, elapsedMs: 3000, answers: ['二氧化碳'] }));
    expect(store.list(1)).toEqual([
      { questionNumber: 1, groupNumber: 2, answers: ['光合作用'], rank: 1, elapsedMs: 1500, judgement: 'PENDING' },
      { questionNumber: 1, groupNumber: 4, answers: ['葉綠體'], rank: 2, elapsedMs: 2100, judgement: 'PENDING' },
      { questionNumber: 1, groupNumber: 1, answers: ['二氧化碳'], rank: 3, elapsedMs: 3000, judgement: 'PENDING' },
    ]);
  });

  it('keeps each question separate', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ questionNumber: 1, groupNumber: 1, rank: 1 }));
    store.append(submissionRecord({ questionNumber: 2, groupNumber: 1, rank: 1 }));
    store.append(submissionRecord({ questionNumber: 2, groupNumber: 2, rank: 2 }));
    expect(store.list(1).map((s) => s.groupNumber)).toEqual([1]);
    expect(store.list(2).map((s) => s.groupNumber)).toEqual([1, 2]);
  });

  it('finds a group record with byGroup, and nothing for a group without one', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ groupNumber: 2, rank: 1 }));
    store.append(submissionRecord({ groupNumber: 5, rank: 2 }));
    const question = store.question(1)!;
    expect(question.byGroup(5)?.rank).toBe(2);
    expect(question.byGroup(3)).toBeUndefined();
  });

  it('returns the lowest-rank PENDING record from firstPending, skipping judged ones', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ groupNumber: 2, rank: 1 }));
    store.append(submissionRecord({ groupNumber: 5, rank: 2 }));
    store.append(submissionRecord({ groupNumber: 3, rank: 3 }));
    const question = store.question(1)!;
    expect(question.firstPending()?.groupNumber).toBe(2);
    question.byGroup(2)!.judgement = 'REJECTED';
    expect(question.firstPending()?.groupNumber).toBe(5);
    question.byGroup(5)!.judgement = 'REJECTED';
    question.byGroup(3)!.judgement = 'REJECTED';
    expect(question.firstPending()).toBeUndefined();
  });

  it('closeQuestion marks the question closed and turns PENDING into UNJUDGED, leaving judged ones (REQ-SUB-14)', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ groupNumber: 1, rank: 1 }));
    store.append(submissionRecord({ groupNumber: 2, rank: 2 }));
    store.append(submissionRecord({ groupNumber: 3, rank: 3 }));
    store.append(submissionRecord({ groupNumber: 4, rank: 4 }));
    const question = store.question(1)!;
    question.byGroup(1)!.judgement = 'REJECTED';
    question.byGroup(2)!.judgement = 'ACCEPTED';
    question.winnerGroup = 2;

    store.closeQuestion(1);

    expect(question.closed).toBe(true);
    expect(store.list(1).map((s) => s.judgement)).toEqual(['REJECTED', 'ACCEPTED', 'UNJUDGED', 'UNJUDGED']);
  });

  it('closeQuestion leaves other questions untouched', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ questionNumber: 1 }));
    store.append(submissionRecord({ questionNumber: 2 }));
    store.closeQuestion(1);
    expect(store.list(2)[0]?.judgement).toBe('PENDING');
    expect(store.question(2)?.closed).toBe(false);
  });

  it('closeQuestion on a question without submissions does not throw and the list stays empty', () => {
    const store = new SubmissionStore();
    expect(() => store.closeQuestion(3)).not.toThrow();
    expect(store.list(3)).toEqual([]);
    expect(store.winner(3)).toBeNull();
  });

  it('winner returns the ACCEPTED submission in the teacher view', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ groupNumber: 1, rank: 1 }));
    store.append(submissionRecord({ groupNumber: 2, rank: 2, elapsedMs: 2400, answers: ['葉綠體'] }));
    const question = store.question(1)!;
    question.byGroup(1)!.judgement = 'REJECTED';
    question.byGroup(2)!.judgement = 'ACCEPTED';
    question.winnerGroup = 2;
    expect(store.winner(1)).toEqual({
      questionNumber: 1,
      groupNumber: 2,
      answers: ['葉綠體'],
      rank: 2,
      elapsedMs: 2400,
      judgement: 'ACCEPTED',
    });
  });

  it('winner is null when every submission was rejected or left unjudged (AC-13)', () => {
    const store = new SubmissionStore();
    store.append(submissionRecord({ groupNumber: 1, rank: 1 }));
    store.append(submissionRecord({ groupNumber: 2, rank: 2 }));
    store.question(1)!.byGroup(1)!.judgement = 'REJECTED';
    store.closeQuestion(1);
    expect(store.winner(1)).toBeNull();
  });
});
