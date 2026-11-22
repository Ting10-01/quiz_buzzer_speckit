import { describe, expect, it, vi } from 'vitest';
import { ActivityPhase, type Activity } from '@quiz-buzzer/shared/entities';
import { isValidationError } from '@quiz-buzzer/shared/guards';
import { MockActivityService } from '../../src/services/mock/MockActivityService';
import { MockGuidedNotesService } from '../../src/services/mock/MockGuidedNotesService';
import { MockFixtures, SPREADSHEET_ID } from '../../src/services/mock/MockFixtures';
import { MockSession } from '../../src/services/mock/MockSession';

function setup() {
  const session = new MockSession();
  return { session, activity: new MockActivityService(session) };
}

async function asActivity(promise: Promise<unknown>): Promise<Activity> {
  const value = await promise;
  if (isValidationError(value)) throw new Error('unexpected ValidationError');
  return value as Activity;
}

describe('MockActivityService teacher side (M3)', () => {
  it('creates a PREPARING activity with fixture member counts and fixture questions', async () => {
    const { activity } = setup();
    const created = await asActivity(activity.createActivity({ groupCount: 6 }));
    expect(created.phase).toBe(ActivityPhase.PREPARING);
    expect(created.groupCount).toBe(6);
    expect(created.groups).toEqual(MockFixtures.groupMembers);
    expect(created.groups.some((g) => g.memberCount === 0)).toBe(true);
    expect(created.questions).toEqual(MockFixtures.activity.questions);
  });

  it('takes questions from lastImport when there is one', async () => {
    const { session, activity } = setup();
    session.onRequest(() => session.answer(SPREADSHEET_ID.SINGLE_ONLY));
    const notes = new MockGuidedNotesService(session);
    const sheet = await notes.pickSpreadsheet();
    await notes.readWorksheet(sheet!.id, sheet!.selectedWorksheet);
    const created = await asActivity(activity.createActivity({ groupCount: 3 }));
    expect(created.questions).toHaveLength(6);
    expect(created.groups.map((g) => g.number)).toEqual([1, 2, 3]);
  });

  it('updateSettings returns the new group count', async () => {
    const { activity } = setup();
    await activity.createActivity({ groupCount: 6 });
    const updated = await asActivity(activity.updateSettings({ groupCount: 4 }));
    expect(updated.groupCount).toBe(4);
    expect(updated.groups).toHaveLength(4);
    expect(updated.phase).toBe(ActivityPhase.PREPARING);
  });

  it('fails validation only for the next call after failNextValidation (edge)', async () => {
    const { activity } = setup();
    activity.failNextValidation();
    await expect(activity.createActivity({ groupCount: 6 })).resolves.toEqual({
      field: 'groupCount',
      message: '模擬：驗證失敗',
    });
    expect(isValidationError(await activity.createActivity({ groupCount: 6 }))).toBe(false);
    activity.failNextValidation();
    expect(isValidationError(await activity.updateSettings({ groupCount: 5 }))).toBe(true);
  });

  it('opens and ends questions; ending the last question finishes the activity', async () => {
    const { activity } = setup();
    await activity.createActivity({ groupCount: 6 });
    expect(await activity.openQuestion(1)).toMatchObject({ phase: 'OPEN', currentQuestion: 1 });
    expect(await activity.endQuestion(1)).toMatchObject({
      phase: 'QUESTION_ENDED',
      currentQuestion: 1,
    });
    await activity.openQuestion(4);
    expect(await activity.endQuestion(4)).toMatchObject({ phase: 'FINISHED' });
  });

  it('accepts onActivityChange subscriptions without notifying', async () => {
    const { activity } = setup();
    const listener = vi.fn();
    const unsubscribe = activity.onActivityChange(listener);
    await activity.createActivity({ groupCount: 6 });
    await activity.openQuestion(1);
    expect(listener).not.toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });
});

describe('MockActivityService viewer side (M7)', () => {
  it('starts with no activity', async () => {
    await expect(setup().activity.getCurrentActivity()).resolves.toBeNull();
  });

  it('advances through the M7 sequence and notifies onPhaseChange', async () => {
    const { activity } = setup();
    const listener = vi.fn();
    activity.onPhaseChange(listener);
    const expected: [string, number | undefined][] = [['PREPARING', undefined]];
    for (let q = 1; q <= 4; q += 1) expected.push(['OPEN', q], ['QUESTION_ENDED', q]);
    expected.push(['FINISHED', undefined]);
    for (const [phase, currentQuestion] of expected) {
      const next = await activity.advancePhase();
      expect(next.phase).toBe(phase);
      expect(next.currentQuestion).toBe(currentQuestion);
      expect(next.groupCount).toBe(6);
      expect(next.questions).toHaveLength(4);
    }
    expect(listener).toHaveBeenCalledTimes(expected.length);
    await expect(activity.getCurrentActivity()).resolves.toMatchObject({ phase: 'FINISHED' });
  });

  it('stays FINISHED when advanced again (edge)', async () => {
    const { activity } = setup();
    for (let i = 0; i < 10; i += 1) await activity.advancePhase();
    expect((await activity.advancePhase()).phase).toBe('FINISHED');
  });

  it('teacher actions do not change what the viewer sees', async () => {
    const { activity } = setup();
    await activity.createActivity({ groupCount: 3 });
    await activity.openQuestion(1);
    await expect(activity.getCurrentActivity()).resolves.toBeNull();
  });

  it('remembers the joined group and forgets it on leave', async () => {
    const { session, activity } = setup();
    await activity.advancePhase();
    const joined = await activity.joinGroup(3);
    expect(joined.phase).toBe('PREPARING');
    expect(session.joinedGroup).toBe(3);
    await activity.leaveGroup();
    expect(session.joinedGroup).toBeUndefined();
  });

  it('stops notifying after unsubscribe', async () => {
    const { activity } = setup();
    const listener = vi.fn();
    activity.onPhaseChange(listener)();
    await activity.advancePhase();
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects the next call once after failNextCall', async () => {
    const { session, activity } = setup();
    session.failNextCall();
    await expect(activity.createActivity({ groupCount: 6 })).rejects.toEqual({
      message: '模擬：連不上伺服器',
    });
    await expect(activity.createActivity({ groupCount: 6 })).resolves.toMatchObject({
      phase: 'PREPARING',
    });
  });
});
