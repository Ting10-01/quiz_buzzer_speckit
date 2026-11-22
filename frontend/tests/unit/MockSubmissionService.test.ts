import { describe, expect, it, vi } from 'vitest';
import { Judgement, type Submission } from '@quiz-buzzer/shared/entities';
import { isValidationError } from '@quiz-buzzer/shared/guards';
import { MockActivityService } from '../../src/services/mock/MockActivityService';
import { MockSession } from '../../src/services/mock/MockSession';
import { MockSubmissionService } from '../../src/services/mock/MockSubmissionService';

function setup() {
  const session = new MockSession();
  return {
    session,
    activity: new MockActivityService(session),
    submission: new MockSubmissionService(session),
  };
}

async function asSubmission(promise: Promise<unknown>): Promise<Submission> {
  const value = await promise;
  if (isValidationError(value)) throw new Error('unexpected ValidationError');
  return value as Submission;
}

describe('MockSubmissionService teacher side (M4)', () => {
  it('lists at least two PENDING submissions ordered by rank for non-last questions', async () => {
    const { activity, submission } = setup();
    await activity.createActivity({ groupCount: 6 });
    for (const q of [1, 2, 3]) {
      const list = await submission.listSubmissions(q);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.map((s) => s.rank)).toEqual(list.map((_, i) => i + 1));
      expect(list.every((s) => s.judgement === Judgement.PENDING && s.questionNumber === q)).toBe(
        true,
      );
    }
  });

  it('lists no submissions for the last question (edge)', async () => {
    const { activity, submission } = setup();
    await activity.createActivity({ groupCount: 6 });
    await expect(submission.listSubmissions(4)).resolves.toEqual([]);
  });

  it('judges any PENDING submission and returns the whole list', async () => {
    const { activity, submission } = setup();
    await activity.createActivity({ groupCount: 6 });
    const list = await submission.listSubmissions(1);
    const [first, second] = list;
    let updated = await submission.judge(1, second.groupNumber, Judgement.REJECTED);
    expect(updated).toHaveLength(list.length);
    expect(updated.find((s) => s.groupNumber === second.groupNumber)?.judgement).toBe('REJECTED');
    updated = await submission.judge(1, first.groupNumber, Judgement.ACCEPTED);
    expect(updated.find((s) => s.groupNumber === first.groupNumber)?.judgement).toBe('ACCEPTED');
    await expect(submission.listSubmissions(1)).resolves.toEqual(updated);
  });

  it('accepts onSubmissionsChange subscriptions without notifying', async () => {
    const { submission } = setup();
    const listener = vi.fn();
    expect(typeof submission.onSubmissionsChange(1, listener)).toBe('function');
    await submission.listSubmissions(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('MockSubmissionService student side (M5, M6)', () => {
  async function joined(group = 2) {
    const ctx = setup();
    await ctx.activity.advancePhase();
    await ctx.activity.joinGroup(group);
    return ctx;
  }

  it('submits a PENDING answer for the joined group', async () => {
    const { submission } = await joined(2);
    const sent = await asSubmission(submission.submitAnswer(1, ['CPU', '作業系統']));
    expect(sent).toMatchObject({
      questionNumber: 1,
      groupNumber: 2,
      answers: ['CPU', '作業系統'],
      rank: 1,
      judgement: 'PENDING',
    });
  });

  it('fails validation once after failNextValidation (edge)', async () => {
    const { submission } = await joined();
    submission.failNextValidation();
    await expect(submission.submitAnswer(1, [''])).resolves.toEqual({
      field: 'answers.0',
      message: '模擬：驗證失敗',
    });
    expect(isValidationError(await submission.submitAnswer(1, ['x']))).toBe(false);
  });

  it('simulateJudgement updates the latest submission and notifies onJudgement', async () => {
    const { submission } = await joined(2);
    const listener = vi.fn();
    submission.onJudgement(listener);
    await submission.submitAnswer(1, ['a']);
    const judged = await submission.simulateJudgement(Judgement.ACCEPTED);
    expect(judged).toMatchObject({ groupNumber: 2, questionNumber: 1, judgement: 'ACCEPTED' });
    expect(listener).toHaveBeenCalledWith(judged);
  });

  it('a resubmission after rejection creates a new PENDING submission', async () => {
    const { submission } = await joined(2);
    const first = await asSubmission(submission.submitAnswer(1, ['a']));
    await submission.simulateJudgement(Judgement.REJECTED);
    const second = await asSubmission(submission.submitAnswer(1, ['b']));
    expect(second.judgement).toBe('PENDING');
    expect(second.answers).toEqual(['b']);
    expect(second.rank).toBe(first.rank + 1);
    const judged = await submission.simulateJudgement(Judgement.ACCEPTED);
    expect(judged.answers).toEqual(['b']);
  });
});
