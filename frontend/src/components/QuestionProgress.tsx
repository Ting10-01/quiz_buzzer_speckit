// Question progress (FR-030, FR-034, FR-057): each question's winner or state, and optionally
// the questions won by each group. Results come from the result service as they are; the
// component only counts winners for display.
import { useId } from 'react';
import type { Group, Question, QuestionResult } from '@quiz-buzzer/shared/entities';
import { noWinnerLabel } from './submissionLabels';
import styles from './QuestionProgress.module.css';

interface QuestionProgressProps {
  questions: Question[];
  results: QuestionResult[];
  /**
   * The question the activity is on. Earlier questions have ended, later ones are not open.
   * Without it every question is treated as ended (the results pages).
   */
  currentQuestion?: number;
  /** True when currentQuestion has ended too (T-QuestionEnd); otherwise it is in progress. */
  currentEnded?: boolean;
  /** When given, also lists the questions won by each of these groups. */
  groups?: Group[];
}

export function QuestionProgress({
  questions,
  results,
  currentQuestion,
  currentEnded = false,
  groups,
}: QuestionProgressProps) {
  const progressId = useId();
  const winsId = useId();
  const resultOf = (n: number) => results.find((r) => r.questionNumber === n);

  const status = (n: number): string => {
    if (currentQuestion !== undefined) {
      if (n > currentQuestion) return '還沒開放';
      if (n === currentQuestion && !currentEnded) return '進行中';
    }
    const result = resultOf(n);
    if (!result) return '';
    return result.winner ? `第 ${result.winner.groupNumber} 組` : noWinnerLabel(result);
  };

  const wins = (groupNumber: number) =>
    results.filter((r) => r.winner?.groupNumber === groupNumber).length;

  return (
    <div className={styles.progress}>
      <section className={styles.block}>
        <h2 className={styles.title} id={progressId}>
          題目進度
        </h2>
        <ul aria-labelledby={progressId} className={styles.list}>
          {questions.map((question) => (
            <li
              key={question.number}
              className={question.number === currentQuestion ? styles.current : undefined}
            >
              <span className={styles.label}>第 {question.number} 題</span>
              <span className={styles.value}>{status(question.number)}</span>
            </li>
          ))}
        </ul>
      </section>
      {groups && (
        <section className={styles.block}>
          <h2 className={styles.title} id={winsId}>
            各組搶到的題數
          </h2>
          <ul aria-labelledby={winsId} className={styles.list}>
            {groups.map((group) => (
              <li key={group.number}>
                <span className={styles.label}>第 {group.number} 組</span>
                <span className={styles.value}>{wins(group.number)} 題</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
