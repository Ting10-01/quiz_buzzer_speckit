import { describe, expect, it } from 'vitest';
import { Audience, toActivity } from '../../../src/activity/ActivityView.js';
import { activityState } from '../../helpers/activityState.js';

// data-model "Audience 與 ActivityView", research RA-08; REQ-ACT-19 (students get no sheet details).
const ACTIVITY_FIELDS = ['currentQuestion', 'groupCount', 'groups', 'phase', 'questions', 'spreadsheet'];

describe('toActivity', () => {
  it('gives the teacher the full activity', () => {
    const state = activityState({ phase: 'OPEN', currentQuestion: 2, openedAt: new Map([[1, 10], [2, 20]]) });
    const activity = toActivity(state, [1, 0, 2, 0], Audience.TEACHER);
    expect(activity).toEqual({
      groupCount: 4,
      phase: 'OPEN',
      currentQuestion: 2,
      spreadsheet: state.spreadsheet,
      questions: state.questions,
      groups: [
        { number: 1, memberCount: 1 },
        { number: 2, memberCount: 0 },
        { number: 3, memberCount: 2 },
        { number: 4, memberCount: 0 },
      ],
    });
  });

  it('gives students a blank spreadsheet and everything else the same', () => {
    const state = activityState({ phase: 'QUESTION_ENDED', currentQuestion: 1 });
    const teacher = toActivity(state, [0, 3, 0, 0], Audience.TEACHER);
    const student = toActivity(state, [0, 3, 0, 0], Audience.PUBLIC);
    expect(student.spreadsheet).toEqual({ id: '', title: '', editable: false, worksheets: [], selectedWorksheet: '' });
    expect({ ...student, spreadsheet: undefined }).toEqual({ ...teacher, spreadsheet: undefined });
  });

  it('builds one group per count, numbered from 1', () => {
    const state = activityState({ groupCount: 3 });
    expect(toActivity(state, [2, 0, 5], Audience.PUBLIC).groups).toEqual([
      { number: 1, memberCount: 2 },
      { number: 2, memberCount: 0 },
      { number: 3, memberCount: 5 },
    ]);
  });

  it('has no current question while preparing', () => {
    const activity = toActivity(activityState(), [0, 0, 0, 0], Audience.TEACHER);
    expect(activity.phase).toBe('PREPARING');
    expect(activity.currentQuestion).toBeUndefined();
  });

  it('keeps the last question as the current question when finished', () => {
    const state = activityState({ phase: 'FINISHED', currentQuestion: 4 });
    expect(toActivity(state, [0, 0, 0, 0], Audience.PUBLIC).currentQuestion).toBe(4);
  });

  it('leaves out the server-only times (openedAt, endedAt)', () => {
    const state = activityState({
      phase: 'QUESTION_ENDED',
      currentQuestion: 1,
      openedAt: new Map([[1, 100]]),
      endedAt: new Map([[1, 200]]),
    });
    for (const audience of [Audience.TEACHER, Audience.PUBLIC]) {
      expect(Object.keys(toActivity(state, [0, 0, 0, 0], audience)).sort()).toEqual(ACTIVITY_FIELDS);
    }
  });
});
