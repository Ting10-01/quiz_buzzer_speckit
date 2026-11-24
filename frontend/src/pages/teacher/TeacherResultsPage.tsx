// TeacherResultsPage: T-Results (FR-040, FR-042) and the T-WriteBack dialog (FR-041).
// Results come from getAllResults() as they are; the seconds behind first are the result
// service's behindFirstMs, never computed here (FR-003). The sheet, worksheet and blank cells
// come from the finished Activity passed by the console (C-5).
// Not shown (SC-004): end time and total duration, CSV export, backup sheets, a new round,
// and clearing old answers.
import { useCallback, useEffect, useState } from 'react';
import type { Activity, QuestionResult, WriteBackResult } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError } from '@quiz-buzzer/shared/guards';
import type { Navigate, PageState } from '../../app/AppRouter';
import { ActionBar } from '../../components/ActionBar';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorArea } from '../../components/ErrorArea';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { QuestionProgress } from '../../components/QuestionProgress';
import { questionTypeLabel } from '../../components/questionLabels';
import { SheetPreview } from '../../components/SheetPreview';
import { SubmissionTable } from '../../components/SubmissionTable';
import { answersLabel, noWinnerLabel } from '../../components/submissionLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './TeacherResultsPage.module.css';

type TeacherResultsPageState = Extract<PageState, { id: 'T-Results' }>;

function errorMessage(reason: unknown): string {
  return isUnexpectedError(reason) ? reason.message : String(reason);
}

/** What write-back puts in each blank cell: the winning group's answer per sub-question. */
function filledCells(activity: Activity, results: QuestionResult[]): Record<string, string> {
  const filled: Record<string, string> = {};
  for (const result of results) {
    const question = activity.questions.find((q) => q.number === result.questionNumber);
    if (!question || !result.winner) continue;
    question.subQuestions.forEach((sub, i) => {
      const answer = result.winner?.answers[i];
      if (answer !== undefined) filled[sub.blankCell] = answer;
    });
  }
  return filled;
}

function writeBackText(result?: WriteBackResult): string {
  if (!result) return '尚未寫回';
  return result.ok
    ? `寫回成功：已寫入 ${result.cellCount} 格`
    : `寫回失敗：${result.failureReason ?? ''}`;
}

export function TeacherResultsPage({
  navigate,
  page,
}: {
  navigate: Navigate;
  page: TeacherResultsPageState;
}) {
  const { result: resultService } = useServiceRegistry();
  const { activity } = page;
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeResult, setWriteResult] = useState<WriteBackResult>();
  const [error, setError] = useState<string>();

  // Stable, so ConfirmDialog keeps one entry for browser back (FR-014).
  const closeWrite = useCallback(() => setWriteOpen(false), [setWriteOpen]);

  useEffect(() => {
    let active = true;
    resultService
      .getAllResults()
      .then((all) => active && setResults(all))
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    return () => {
      active = false;
    };
  }, [resultService]);

  const writeBack = async () => {
    // The dialog closes first, so the outcome or an error shows on T-Results (FR-009, FR-042).
    setWriteOpen(false);
    try {
      const outcome = await resultService.writeBack();
      setError(undefined);
      setWriteResult(outcome);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const cellCount = activity.questions.reduce((sum, q) => sum + q.subQuestions.length, 0);
  const { title, selectedWorksheet } = activity.spreadsheet;

  return (
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} subtitle="結果" />
      <main className={styles.main}>
        <div className={styles.intro}>
          <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>
          <h1 className={styles.title}>搶答結果</h1>
        </div>

        <ErrorArea message={error} />

        <div className={styles.columns}>
          <div className={styles.stack}>
            {activity.questions.map((question) => {
              const result = results.find((r) => r.questionNumber === question.number);
              return (
                <section
                  key={question.number}
                  aria-label={`第 ${question.number} 題`}
                  className={styles.card}
                >
                  <header className={styles.questionHead}>
                    <h2 className={styles.cardTitle}>第 {question.number} 題</h2>
                    <span className={styles.muted}>{questionTypeLabel(question)}</span>
                    {result && (
                      <span className={styles.muted}>送出 {result.submissionCount} 組</span>
                    )}
                  </header>
                  {result &&
                    (result.winner ? (
                      <p className={styles.winner}>
                        <span className={styles.winnerGroup}>第 {result.winner.groupNumber} 組</span>
                        <span>{answersLabel(result.winner.answers)}</span>
                      </p>
                    ) : (
                      <p className={styles.muted}>{noWinnerLabel(result)}</p>
                    ))}
                  {result && result.submissions.length > 0 && (
                    <SubmissionTable
                      label={`第 ${question.number} 題的送出`}
                      submissions={result.submissions}
                      behindFirstMs={result.behindFirstMs}
                    />
                  )}
                </section>
              );
            })}
          </div>

          <div className={styles.stack}>
            <section className={styles.card}>
              <QuestionProgress
                questions={activity.questions}
                results={results}
                groups={activity.groups}
              />
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>寫回 Google Sheets</h2>
              <p className={styles.muted}>
                {title}・工作表「{selectedWorksheet}」
              </p>
              <p className={styles.status} aria-live="polite">
                {writeBackText(writeResult)}
              </p>
              <SheetPreview
                result={{ questions: activity.questions }}
                filled={filledCells(activity, results)}
              />
            </section>
          </div>
        </div>

        <ActionBar
          primary={
            <button type="button" className="btn btn-primary" onClick={() => setWriteOpen(true)}>
              寫回 Google Sheets
            </button>
          }
        />

        <ConfirmDialog
          open={writeOpen}
          title="寫回 Google Sheets？"
          onClose={closeWrite}
          actions={[
            { label: '取消', onClick: closeWrite },
            { label: '寫回', variant: 'primary', onClick: () => void writeBack() },
          ]}
        >
          <p>
            把每題成功組別的答案寫入「{title}」的「{selectedWorksheet}」工作表。這些填空格原本的內容會被覆蓋。
          </p>
          <dl className={styles.dialogStats}>
            <div>
              <dt>寫入答案</dt>
              <dd>
                {cellCount} 格（{activity.questions.length} 題）
              </dd>
            </div>
          </dl>
        </ConfirmDialog>
      </main>
    </div>
  );
}
