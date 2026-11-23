import { describe, expect, it } from 'vitest';
import { ResultQuery, ResultQueryError } from '../../../src/results/ResultQuery.js';
import {
  FakeActivityStore,
  finishedActivityScenario,
  midActivityScenario,
  submission,
  type ResultScenario,
} from '../../results/helpers/resultFakes.js';

function queryOf(scenario: ResultScenario): ResultQuery {
  return new ResultQuery(scenario.activities, scenario.submissions);
}

function errorOf(run: () => unknown): ResultQueryError {
  try {
    run();
  } catch (error) {
    if (error instanceof ResultQueryError) return error;
    throw error;
  }
  throw new Error('no ResultQueryError was thrown');
}

describe('ResultQuery.questionResult before the activity finishes', () => {
  it('returns the winning group, its answers and the submission count of an ended question (AC-01)', () => {
    const result = queryOf(midActivityScenario()).questionResult(1, null);
    expect(result.questionNumber).toBe(1);
    expect(result.winner).toMatchObject({ groupNumber: 3, answers: ['CPU', '作業系統'], judgement: 'ACCEPTED' });
    expect(result.submissionCount).toBe(2);
  });

  it("adds only the viewer group's own submission, with rank and gap hidden (AC-02, REQ-RES-03)", () => {
    const result = queryOf(midActivityScenario()).questionResult(2, 5);
    expect(result).toEqual({
      questionNumber: 2,
      winner: submission(2, 2, 0, 5000, 'ACCEPTED', ['演算法', '堆疊']),
      submissionCount: 3,
      submissions: [submission(2, 5, 0, 4100, 'REJECTED', ['演算法', '佇列'])],
      behindFirstMs: [0],
    });
    expect(JSON.stringify(result)).not.toContain('流程圖');
  });

  it("gives the winning group its own submission with rank 0", () => {
    const result = queryOf(midActivityScenario()).questionResult(2, 2);
    expect(result.submissions).toEqual([submission(2, 2, 0, 5000, 'ACCEPTED', ['演算法', '堆疊'])]);
    expect(result.behindFirstMs).toEqual([0]);
  });

  it('gives a group without a submission no submissions', () => {
    const result = queryOf(midActivityScenario()).questionResult(2, 6);
    expect(result.submissions).toEqual([]);
    expect(result.behindFirstMs).toEqual([]);
  });

  it('gives the teacher and connections without a group no submissions (AC-06)', () => {
    const result = queryOf(midActivityScenario()).questionResult(2, null);
    expect(result.submissions).toEqual([]);
    expect(result.behindFirstMs).toEqual([]);
    expect(result.submissionCount).toBe(3);
  });

  it('has no winner when every submission was rejected (AC-03)', () => {
    const scenario = midActivityScenario();
    scenario.submissions.set(2, [
      submission(2, 1, 1, 3200, 'REJECTED', ['流程圖', '佇列']),
      submission(2, 5, 2, 4100, 'REJECTED', ['演算法', '佇列']),
    ]);
    const result = queryOf(scenario).questionResult(2, null);
    expect(result).not.toHaveProperty('winner');
    expect(result.submissionCount).toBe(2);
  });

  it('has no winner and no submissions when nobody submitted (AC-04)', () => {
    const scenario = midActivityScenario();
    scenario.submissions.set(2, []);
    const result = queryOf(scenario).questionResult(2, 5);
    expect(result).toEqual({ questionNumber: 2, submissionCount: 0, submissions: [], behindFirstMs: [] });
  });

  it.each([3, 4])('refuses question %i, which has not ended (AC-05, REQ-RES-02)', (n) => {
    const error = errorOf(() => queryOf(midActivityScenario()).questionResult(n, 4));
    expect(error.code).toBe('QUESTION_NOT_ENDED');
    expect(error.message).toBe('這一題還沒結束，結果尚未公布');
  });
});

describe('ResultQuery.questionResult errors (REQ-RES-06)', () => {
  it('answers NO_ACTIVITY without an activity', () => {
    const error = errorOf(() =>
      new ResultQuery(new FakeActivityStore(null), midActivityScenario().submissions).questionResult(1, null),
    );
    expect(error.code).toBe('NO_ACTIVITY');
    expect(error.message).toBe('目前沒有活動');
  });

  it.each([0, 5, 1.5, -1, Number.NaN])('answers QUESTION_NOT_FOUND for question %s', (n) => {
    const error = errorOf(() => queryOf(finishedActivityScenario()).questionResult(n, null));
    expect(error.code).toBe('QUESTION_NOT_FOUND');
    expect(error.message).toBe('沒有這一題');
  });
});

describe('ResultQuery.questionResult after the activity finishes (REQ-RES-05)', () => {
  it.each([1, 2, 3, 4])("question %i equals 005's winner(n) and list(n)", (n) => {
    const scenario = finishedActivityScenario();
    const result = queryOf(scenario).questionResult(n, 5);
    expect(result.winner).toEqual(scenario.submissions.winner(n) ?? undefined);
    expect(result.submissions).toEqual(scenario.submissions.list(n));
    expect(result.submissionCount).toBe(scenario.submissions.list(n).length);
  });
});
