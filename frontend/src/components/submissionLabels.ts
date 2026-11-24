import { Judgement, type QuestionResult } from '@quiz-buzzer/shared/entities';

/** Display text for each judgement (FR-031); the kinds themselves belong to 005. */
export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  [Judgement.PENDING]: '待判定',
  [Judgement.ACCEPTED]: '已接受',
  [Judgement.REJECTED]: '不接受',
  [Judgement.UNJUDGED]: '未判定',
};

/** Milliseconds as seconds with three decimals, e.g. "6.204 秒". */
export function secondsLabel(ms: number): string {
  return `${(ms / 1000).toFixed(3)} 秒`;
}

/** One answer as is; several numbered in sub-question order, e.g. "（1）CPU（2）作業系統" with an ideographic space between. */
export function answersLabel(answers: string[]): string {
  return answers.length === 1 ? answers[0] : answers.map((a, i) => `（${i + 1}）${a}`).join('\u3000');
}

/** Group numbers as "第 1、3 組". */
export function groupsLabel(groupNumbers: number[]): string {
  return `第 ${groupNumbers.join('、')} 組`;
}

/** Outcome of an ended question when nobody won: no submissions vs. none accepted (FR-034). */
export function noWinnerLabel(result: QuestionResult): string {
  return result.submissionCount === 0 ? '沒有組別送出' : '沒有組別搶答成功';
}
