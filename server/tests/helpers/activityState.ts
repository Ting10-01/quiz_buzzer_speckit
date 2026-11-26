import type { ActivityState } from '../../src/activity/ActivityStore.js';
import { fourQuestionImport } from './activityTestServer.js';

// An ActivityState built from the 4-question import, PREPARING with 4 groups unless overridden.
export function activityState(overrides: Partial<ActivityState> = {}): ActivityState {
  const imported = fourQuestionImport();
  return {
    spreadsheet: imported.spreadsheet,
    questions: imported.questions,
    groupCount: 4,
    phase: 'PREPARING',
    openedAt: new Map(),
    endedAt: new Map(),
    ...overrides,
  };
}
