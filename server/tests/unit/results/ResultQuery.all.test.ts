import { describe, expect, it } from 'vitest';
import { ResultQuery, ResultQueryError } from '../../../src/results/ResultQuery.js';
import type { QuestionResult, Submission } from '../../../src/temp-shared/entities.js';
import {
  FakeActivityStore,
  finishedActivityScenario,
  midActivityScenario,
  submission,
  type ResultScenario,
} from '../../results/helpers/resultFakes.js';

const VIEWERS = [1, 2, 3, 4, 5, 6, null];

function queryOf(scenario: ResultScenario): ResultQuery {
  return new ResultQuery(scenario.activities, scenario.submissions);
}

// Every Submission a viewer receives, the winner included.
function submissionsIn(results: QuestionResult[]): Submission[] {
  return results.flatMap((r) => [...(r.winner ? [r.winner] : []), ...r.submissions]);
}

describe('ResultQuery.allResults after the activity finishes', () => {
  it('returns every submission of every question by rank (AC-07, AC-08, REQ-RES-04)', () => {
    const scenario = finishedActivityScenario();
    const results = queryOf(scenario).allResults(5);
    expect(results.map((r) => r.questionNumber)).toEqual([1, 2, 3, 4]);
    for (const result of results) {
      expect(result.submissions).toEqual(scenario.submissions.list(result.questionNumber));
      expect(result.submissions.map((s) => s.rank)).toEqual(result.submissions.map((_, i) => i + 1));
    }
  });

  it('gives students, the teacher and connections without a group the same content', () => {
    const query = queryOf(finishedActivityScenario());
    const expected = query.allResults(null);
    for (const viewer of VIEWERS) expect(query.allResults(viewer)).toEqual(expected);
  });

  it('keeps a submission still pending at the end as UNJUDGED and not the winner (AC-09)', () => {
    const q4 = queryOf(finishedActivityScenario()).allResults(null)[3]!;
    expect(q4.submissions[2]).toEqual(submission(4, 3, 3, 5000, 'UNJUDGED', ['IP']));
    expect(q4.winner).toEqual(submission(4, 5, 2, 5000, 'ACCEPTED', ['IP']));
  });

  it('measures behindFirstMs from the earliest submission (AC-30, REQ-RES-21)', () => {
    const results = queryOf(finishedActivityScenario()).allResults(null);
    expect(results[3]!.behindFirstMs).toEqual([0, 1800, 1800]);
    expect(results[1]!.behindFirstMs).toEqual([0, 900, 1800]);
  });

  it('has an empty behindFirstMs for a question without submissions', () => {
    const q3 = queryOf(finishedActivityScenario()).allResults(null)[2]!;
    expect(q3).toEqual({ questionNumber: 3, submissionCount: 0, submissions: [], behindFirstMs: [] });
  });

  it('counts the last question as ended when the activity is FINISHED without its endedAt', () => {
    const scenario = finishedActivityScenario();
    expect(scenario.activities.current()?.endedAt.has(4)).toBe(false);
    expect(queryOf(scenario).allResults(null).map((r) => r.questionNumber)).toContain(4);
  });
});

describe('ResultQuery.allResults during the activity', () => {
  it("returns only ended questions, each with the viewer's own submission, rank and gap 0 (AC-10)", () => {
    const results = queryOf(midActivityScenario()).allResults(1);
    expect(results).toEqual([
      {
        questionNumber: 1,
        winner: submission(1, 3, 0, 2000, 'ACCEPTED', ['CPU', '作業系統']),
        submissionCount: 2,
        submissions: [submission(1, 1, 0, 3000, 'REJECTED', ['GPU', '作業系統'])],
        behindFirstMs: [0],
      },
      {
        questionNumber: 2,
        winner: submission(2, 2, 0, 5000, 'ACCEPTED', ['演算法', '堆疊']),
        submissionCount: 3,
        submissions: [submission(2, 1, 0, 3200, 'REJECTED', ['流程圖', '佇列'])],
        behindFirstMs: [0],
      },
    ]);
  });

  it('answers NO_ACTIVITY without an activity', () => {
    const query = new ResultQuery(new FakeActivityStore(null), midActivityScenario().submissions);
    expect(() => query.allResults(null)).toThrow(ResultQueryError);
    expect(() => query.allResults(null)).toThrow('目前沒有活動');
  });
});

// SC-006: question ended or not x activity finished or not x every group and null.
describe('disclosure, exhaustively (SC-006)', () => {
  const scenarios = { during: midActivityScenario, finished: finishedActivityScenario };

  for (const [name, make] of Object.entries(scenarios)) {
    for (const viewer of VIEWERS) {
      it(`${name} the activity, viewer ${viewer}`, () => {
        const scenario = make();
        const state = scenario.activities.current()!;
        const query = queryOf(scenario);
        const finished = state.phase === 'FINISHED';
        const ended = (n: number) => finished || state.endedAt.has(n);

        const viaQuestions: QuestionResult[] = [];
        for (const { number } of state.questions) {
          if (ended(number)) viaQuestions.push(query.questionResult(number, viewer));
          else expect(() => query.questionResult(number, viewer)).toThrow('這一題還沒結束，結果尚未公布');
        }
        const viaAll = query.allResults(viewer);
        expect(viaAll).toEqual(viaQuestions);

        const received = submissionsIn(viaAll);
        // A question that has not ended: 0 of its submissions.
        expect(received.filter((s) => !ended(s.questionNumber))).toEqual([]);
        if (finished) {
          const all = state.questions.flatMap((q) => scenario.submissions.list(q.number));
          expect(viaAll.flatMap((r) => r.submissions)).toEqual(all);
        } else {
          // Before the end: 0 submissions of other groups that did not win, and no rank or gap.
          expect(received.filter((s) => s.groupNumber !== viewer && s.judgement !== 'ACCEPTED')).toEqual([]);
          expect(received.every((s) => s.rank === 0)).toBe(true);
          expect(viaAll.every((r) => r.behindFirstMs.every((ms) => ms === 0))).toBe(true);
        }
      });
    }
  }
});
