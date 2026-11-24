// S-Results: all results once the activity has finished (FR-058). Shows the number of
// questions this group won and every submission of each question with its rank and
// judgement, as returned by the result service (FR-003). The page offers no buttons, and
// "開新一輪" from the design is not shown (SC-004).
import { useEffect, useState } from 'react';
import type { PageState } from '../../app/AppRouter';
import type { QuestionResult } from '@quiz-buzzer/shared/entities';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { SubmissionTable } from '../../components/SubmissionTable';
import { noWinnerLabel } from '../../components/submissionLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './StudentResultsPage.module.css';

interface StudentResultsPageProps {
  page: Extract<PageState, { id: 'S-Results' }>;
}

export function StudentResultsPage({ page }: StudentResultsPageProps) {
  const { result: resultService } = useServiceRegistry();
  const { groupNumber } = page;
  const [results, setResults] = useState<QuestionResult[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    resultService.getAllResults().then(
      (all) => active && setResults(all),
      (reason: unknown) =>
        active && setError(errorMessage(reason)),
    );
    return () => {
      active = false;
    };
  }, [resultService]);

  const wins = results?.filter((r) => r.winner?.groupNumber === groupNumber).length;

  return (
    <>
      <AppHeader variant="student" groupNumber={groupNumber}>
        <span className={styles.phase}>{PHASE_LABEL.FINISHED}</span>
      </AppHeader>
      <main className={styles.main}>
        <ErrorArea message={error} />
        <h1 className={styles.title}>全部結果</h1>
        <dl className={styles.summary}>
          <div>
            <dt>本組搶到</dt>
            <dd>{wins === undefined ? '' : `${wins} 題`}</dd>
          </div>
        </dl>
        {results?.map((result) => (
          <section
            key={result.questionNumber}
            aria-label={`第 ${result.questionNumber} 題`}
            className={styles.card}
          >
            <h2 className={styles.cardTitle}>第 {result.questionNumber} 題</h2>
            {result.submissions.length > 0 ? (
              <SubmissionTable
                label={`第 ${result.questionNumber} 題的送出`}
                submissions={result.submissions}
                behindFirstMs={result.behindFirstMs}
              />
            ) : (
              <p className={styles.muted}>{noWinnerLabel(result)}</p>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
