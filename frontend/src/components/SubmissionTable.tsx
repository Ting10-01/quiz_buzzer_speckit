// Answer list (FR-031, FR-032, FR-040): submissions in rank order. With onJudge, every row has
// "接受" and "不接受", enabled only on the earliest PENDING row (M4, C-4). The results page
// passes behindFirstMs from the result service instead (FR-003: shown, never computed here).
import { Judgement, type Submission } from '@quiz-buzzer/shared/entities';
import { JUDGEMENT_LABEL, answersLabel, secondsLabel } from './submissionLabels';
import styles from './SubmissionTable.module.css';

interface SubmissionTableProps {
  submissions: Submission[];
  /** Judges one group's submission; without it the table is display-only. */
  onJudge?: (groupNumber: number, judgement: Judgement) => void;
  /** Accessible name of the table. */
  label?: string;
  /** Seconds behind first from the result service, in the same order as submissions. */
  behindFirstMs?: number[];
}

export function SubmissionTable({
  submissions,
  onJudge,
  label = '答案列表',
  behindFirstMs,
}: SubmissionTableProps) {
  const rows = submissions
    .map((submission, i) => ({ submission, behind: behindFirstMs?.[i] }))
    .sort((a, b) => a.submission.rank - b.submission.rank);
  const judgeable = rows.find((r) => r.submission.judgement === Judgement.PENDING)?.submission;

  return (
    <table aria-label={label} className={styles.table}>
      <thead>
        <tr>
          <th scope="col">順位</th>
          <th scope="col">組別</th>
          <th scope="col">答案</th>
          <th scope="col">開放後</th>
          {behindFirstMs && <th scope="col">比第一名慢</th>}
          <th scope="col">判定</th>
          {onJudge && (
            <th scope="col">
              <span className={styles.hidden}>判定按鈕</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ submission, behind }) => {
          const enabled = submission === judgeable;
          return (
            <tr key={submission.groupNumber} className={enabled ? styles.judgeable : undefined}>
              <td className={styles.rank}>#{submission.rank}</td>
              <td className={styles.group}>第 {submission.groupNumber} 組</td>
              <td>{answersLabel(submission.answers)}</td>
              <td className={styles.number}>{secondsLabel(submission.elapsedMs)}</td>
              {behindFirstMs && (
                <td className={styles.number}>
                  {behind === undefined || behind === 0 ? '—' : `慢 ${secondsLabel(behind)}`}
                </td>
              )}
              <td>
                <span className={styles[submission.judgement]}>
                  {JUDGEMENT_LABEL[submission.judgement]}
                </span>
              </td>
              {onJudge && (
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!enabled}
                      onClick={() => onJudge(submission.groupNumber, Judgement.ACCEPTED)}
                    >
                      接受
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!enabled}
                      onClick={() => onJudge(submission.groupNumber, Judgement.REJECTED)}
                    >
                      不接受
                    </button>
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
