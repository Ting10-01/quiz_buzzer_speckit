import type { Activity, Spreadsheet } from '@quiz-buzzer/shared/entities';
import type { ActivityState } from './ActivityStore.js';

/** Who a snapshot is for: the teacher gets everything, everyone else no sheet details (REQ-ACT-19). */
export const Audience = {
  TEACHER: 'TEACHER',
  PUBLIC: 'PUBLIC',
} as const;
export type Audience = (typeof Audience)[keyof typeof Audience];

// Student pages never read the spreadsheet, but Activity requires one (research RA-08).
const BLANK_SPREADSHEET: Spreadsheet = { id: '', title: '', editable: false, worksheets: [], selectedWorksheet: '' };

/** 001's Activity for the audience; counts[i] is the member count of group i + 1. */
export function toActivity(state: Readonly<ActivityState>, counts: number[], audience: Audience): Activity {
  const activity: Activity = {
    groupCount: state.groupCount,
    phase: state.phase,
    spreadsheet: audience === Audience.TEACHER ? state.spreadsheet : { ...BLANK_SPREADSHEET, worksheets: [] },
    questions: state.questions,
    groups: counts.map((memberCount, i) => ({ number: i + 1, memberCount })),
  };
  if (state.currentQuestion !== undefined) activity.currentQuestion = state.currentQuestion;
  return activity;
}
