// Small entity builders for component tests (independent of the mock fixtures).
import type { Activity, Group, Question } from '@quiz-buzzer/shared/entities';

export function makeQuestions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    type: 'SINGLE',
    text: `Question ${i + 1}`,
    subQuestions: [{ index: 1, blankCell: `G${i + 5}` }],
  }));
}

export function makeGroups(memberCounts: number[]): Group[] {
  return memberCounts.map((memberCount, i) => ({ number: i + 1, memberCount }));
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  const groups = overrides.groups ?? makeGroups([3, 2, 0]);
  return {
    groupCount: groups.length,
    phase: 'PREPARING',
    spreadsheet: {
      id: 'sheet',
      title: 'Sample Sheet Title',
      editable: true,
      worksheets: ['學習單'],
      selectedWorksheet: '學習單',
    },
    questions: makeQuestions(4),
    groups,
    ...overrides,
  };
}
