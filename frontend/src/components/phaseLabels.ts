import { ActivityPhase } from '@quiz-buzzer/shared/entities';

/** Display text for each activity phase, shared by every page that shows the phase. */
export const PHASE_LABEL: Record<ActivityPhase, string> = {
  [ActivityPhase.NO_ACTIVITY]: '沒有活動',
  [ActivityPhase.PREPARING]: '準備中',
  [ActivityPhase.OPEN]: '搶答中',
  [ActivityPhase.QUESTION_ENDED]: '本題已結束',
  [ActivityPhase.FINISHED]: '已結束',
};
