// One question's result: the winning group and its answers, or why no group won (FR-034).
// Student pages pass isOwnGroup when their own group won, which shows the group name in green.
import type { QuestionResult } from '@quiz-buzzer/shared/entities';
import { answersLabel, noWinnerLabel } from './submissionLabels';
import styles from './QuestionWinner.module.css';

interface QuestionWinnerProps {
  result: QuestionResult;
  /** True when the viewing student's group is the winner. */
  isOwnGroup?: boolean;
}

export function QuestionWinner({ result, isOwnGroup = false }: QuestionWinnerProps) {
  if (!result.winner) return <p className={styles.none}>{noWinnerLabel(result)}</p>;
  return (
    <p className={styles.winner}>
      <span className={isOwnGroup ? `${styles.group} ${styles.own}` : styles.group}>
        第 {result.winner.groupNumber} 組
      </span>
      <span>{answersLabel(result.winner.answers)}</span>
    </p>
  );
}
