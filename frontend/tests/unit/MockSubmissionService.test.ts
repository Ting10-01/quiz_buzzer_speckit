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

async function teacherWithOpenQuestion(questionNumber: number) {
  const ctx = setup();
  await ctx.activity.createActivity({ groupCount: 6 });
  await ctx.activity.openQuestion(questionNumber);
  return ctx;
}

describe('MockSubmissionService teacher side (M4)', () => {
  it('lists at least two PENDING submissions ordered by rank except for question 3', async () => {
    const { activity, submission } = setup();
    await activity.createActivity({ groupCount: 6 });
    for (const q of [1, 2, 4]) {
      const list = await submission.listSubmissions(q);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.map((s) => s.rank)).toEqual(list.map((_, i) => i + 1));
      expect(list.every((s) => s.judgement === Judgement.PENDING && s.questionNumber === q)).toBe(
        true,
      );
    }
  });

  it('lists no submissions for question 3 (edge)', async () => {
    const { activity, submission } = setup();
    await activity.createActivity({ groupCount: 6 });
    await expect(submission.listSubmissions(3)).resolves.toEqual([]);
  });

  it('rejecting the earliest PENDING keeps the question open and moves to the next one', async () => {
    const { submission } = await teacherWithOpenQuestion(1);
    const [first, second] = await submission.listSubmissions(1);
    const outcome = await submission.judge(1, first.groupNumber, Judgement.REJECTED);
    expect(outcome.activity).toMatchObject({ phase: 'OPEN', currentQuestion: 1 });
    expect(outcome.submissions.find((s) => s.rank === first.rank)?.judgement).toBe('REJECTED');
    const earliestPending = outcome.submissions.find((s) => s.judgement === Judgement.PENDING);
    expect(earliestPending?.groupNumber).toBe(second.groupNumber);
    await expect(submission.listSubmissions(1)).resolves.toEqual(outcome.submissions);
  });

  it('accepting ends the question and writes the teacher activity', async () => {
    const { session, submission } = await teacherWithOpenQuestion(1);
    const [first] = await submission.listSubmissions(1);
    const outcome = await submission.judge(1, first.groupNumber, Judgement.ACCEPTED);
    expect(outcome.activity).toMatchObject({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
    expect(outcome.submissions[0].judgement).toBe('ACCEPTED');
    expect(session.teacherActivity).toMatchObject({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
  });

  it('accepting on the last question finishes the activity (edge)', async () => {
    const { session, submission } = await teacherWithOpenQuestion(4);
    const [first] = await submission.listSubmissions(4);
    const outcome = await submission.judge(4, first.groupNumber, Judgement.ACCEPTED);
    expect(outcome.activity.phase).toBe('FINISHED');
    expect(session.teacherActivity?.phase).toBe('FINISHED');
  });

  it('throws a plain Error when judging a row that is not the earliest PENDING (edge)', async () => {
    const { submission } = await teacherWithOpenQuestion(1);
    const [, second] = await submission.listSubmissions(1);
    const attempt = submission.judge(1, second.groupNumber, Judgement.ACCEPTED);
    await expect(attempt).rejects.toBeInstanceOf(Error);
    const list = await submission.listSubmissions(1);
    expect(list.every((s) => s.judgement === Judgement.PENDING)).toBe(true);
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
  /** Joins `group` while the viewer sees question 1 open. */
  async function joined(group = 2) {
    const ctx = setup();
    await ctx.activity.advancePhase(); // PREPARING
    await ctx.activity.joinGroup(group);
    await ctx.activity.advancePhase(); // OPEN(1)
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

  it('throws a plain Error on a second submission for the same question (edge)', async () => {
    const { submission } = await joined(2);
    await submission.submitAnswer(1, ['a', 'b']);
    await expect(submission.submitAnswer(1, ['c', 'd'])).rejects.toBeInstanceOf(Error);
  });

  it('getGroupSubmission returns null before submitting and the submission after', async () => {
    const { submission } = await joined(2);
    await expect(submission.getGroupSubmission(1)).resolves.toBeNull();
    const sent = await asSubmission(submission.submitAnswer(1, ['a', 'b']));
    await expect(submission.getGroupSubmission(1)).resolves.toEqual(sent);
  });

  it('simulateTeammateSubmission submits fixed answers for this group and notifies', async () => {
    const { submission } = await joined(3);
    const listener = vi.fn();
    submission.onGroupSubmitted(listener);
    const sent = await submission.simulateTeammateSubmission();
    expect(sent).toMatchObject({ questionNumber: 1, groupNumber: 3, judgement: 'PENDING' });
    // Question 1 is a question group with two sub-questions.
    expect(sent.answers).toHaveLength(2);
    expect(listener).toHaveBeenCalledWith(sent);
    await expect(submission.getGroupSubmission(1)).resolves.toEqual(sent);
    await expect(submission.submitAnswer(1, ['a', 'b'])).rejects.toBeInstanceOf(Error);
  });

  it('stops notifying onGroupSubmitted after unsubscribe', async () => {
    const { submission } = await joined(3);
    const listener = vi.fn();
    submission.onGroupSubmitted(listener)();
    await submission.simulateTeammateSubmission();
    expect(listener).not.toHaveBeenCalled();
  });

  it('simulateJudgement(ACCEPTED) notifies onJudgement and advances the viewer phase once', async () => {
    const { activity, submission } = await joined(2);
    const judgementListener = vi.fn();
    const phaseListener = vi.fn();
    submission.onJudgement(judgementListener);
    activity.onPhaseChange(phaseListener);
    await submission.submitAnswer(1, ['a', 'b']);
    const judged = await submission.simulateJudgement(Judgement.ACCEPTED);
    expect(judged).toMatchObject({ groupNumber: 2, questionNumber: 1, judgement: 'ACCEPTED' });
    expect(judgementListener).toHaveBeenCalledWith(judged);
    expect(phaseListener).toHaveBeenCalledTimes(1);
    expect(phaseListener.mock.calls[0][0]).toMatchObject({
      phase: 'QUESTION_ENDED',
      currentQuestion: 1,
    });
  });

  it('simulateJudgement(REJECTED) does not change the viewer phase (edge)', async () => {
    const { activity, submission } = await joined(2);
    const phaseListener = vi.fn();
    activity.onPhaseChange(phaseListener);
    await submission.submitAnswer(1, ['a', 'b']);
    const judged = await submission.simulateJudgement(Judgement.REJECTED);
    expect(judged.judgement).toBe('REJECTED');
    expect(phaseListener).not.toHaveBeenCalled();
    await expect(activity.getCurrentActivity()).resolves.toMatchObject({
      phase: 'OPEN',
      currentQuestion: 1,
    });
  });
});
