// ConsolePage: the teacher console. T-Lobby (FR-025, FR-026), T-Live (FR-030–FR-032a) with
// T-EndConfirm (FR-033), and T-QuestionEnd (FR-034).
// Each page id renders its own view component, so moving between them starts a fresh view.
// T-Lobby uses the Activity returned by createActivity / updateSettings and then the
// onActivityChange snapshots, which start with the activity held when it subscribes; it never
// calls getCurrentActivity (contract C-1, issue #22).
// The console never derives a phase: it follows the Activity the services return (FR-003).
// Connected tab counts, offline state and time limits are not shown (SC-004).
// Cancelling is only offered on T-Lobby, before question 1 opens (FR-026).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityPhase,
  type Activity,
  type Judgement,
  type QuestionResult,
  type Submission,
} from '@quiz-buzzer/shared/entities';
import type { Navigate, PageState } from '../../app/AppRouter';
import { ActionBar } from '../../components/ActionBar';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { GroupGrid } from '../../components/GroupGrid';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { QuestionProgress } from '../../components/QuestionProgress';
import { questionCountLabel, questionTypeLabel } from '../../components/questionLabels';
import { QuestionWinner } from '../../components/QuestionWinner';
import { SubmissionTable } from '../../components/SubmissionTable';
import { groupsLabel } from '../../components/submissionLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './ConsolePage.module.css';

type ConsolePageState = Extract<PageState, { id: 'T-Lobby' | 'T-Live' | 'T-QuestionEnd' }>;

interface ViewProps {
  navigate: Navigate;
  activity: Activity;
}

/**
 * Where the console goes after a question ends (FR-032a, FR-033): T-QuestionEnd, or T-Results
 * once the activity has finished. The phase comes from the returned Activity.
 */
function navigateAfterEnd(navigate: Navigate, activity: Activity) {
  navigate(
    activity.phase === ActivityPhase.FINISHED
      ? { id: 'T-Results', activity }
      : { id: 'T-QuestionEnd', activity },
  );
}

function emptyGroupsText(activity: Activity) {
  const empty = activity.groups.filter((g) => g.memberCount === 0).map((g) => g.number);
  return empty.length === 0
    ? '每一組都有人加入了。'
    : `還沒有人加入的組別：${groupsLabel(empty)}。`;
}

/** Groups of the activity that have no submission in `submissions` (FR-030, FR-033). */
function unsubmittedText(activity: Activity, submissions: Submission[]) {
  const submitted = new Set(submissions.map((s) => s.groupNumber));
  const missing = activity.groups.map((g) => g.number).filter((n) => !submitted.has(n));
  return missing.length === 0 ? '沒有' : groupsLabel(missing);
}

function Shell({ navigate, children }: { navigate: Navigate; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} subtitle="控制台" />
      <main className={styles.main}>{children}</main>
    </div>
  );
}

function LobbyView({ navigate, activity: initial }: ViewProps) {
  const { activity: activityService } = useServiceRegistry();
  const [activity, setActivity] = useState(initial);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string>();

  // Stable, so ConfirmDialog keeps one entry for browser back (FR-014).
  const closeCancel = useCallback(() => setCancelOpen(false), []);

  // Snapshots replace the displayed activity as a whole (contracts "老師端的即時更新").
  useEffect(() => activityService.onActivityChange(setActivity), [activityService]);

  const cancelActivity = async () => {
    // The dialog closes first, so an error shows on T-Lobby (FR-009).
    setCancelOpen(false);
    try {
      await activityService.cancelActivity();
      setError(undefined);
      navigate({ id: 'T-Pick' });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const openFirstQuestion = async () => {
    try {
      const opened = await activityService.openQuestion(1);
      setError(undefined);
      navigate({ id: 'T-Live', activity: opened });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <Shell navigate={navigate}>
      <div className={styles.intro}>
        <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>
        <h1 className={styles.title}>等學生加入</h1>
        <p className={styles.lead}>{emptyGroupsText(activity)}</p>
      </div>

      <ErrorArea message={error} />

      <div className={styles.columns}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>各組</h2>
          <GroupGrid groups={activity.groups} />
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle} id="lobby-questions">
            這一輪的題目
          </h2>
          <ul aria-labelledby="lobby-questions" className={styles.questions}>
            {activity.questions.map((question) => (
              <li key={question.number}>
                <span className={styles.questionNumber}>第 {question.number} 題</span>
                <span className={styles.questionType}>{questionTypeLabel(question)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ActionBar
        back={
          <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(true)}>
            取消活動
          </button>
        }
        primary={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate({ id: 'T-Setup', mode: 'edit', activity })}
            >
              修改設定
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void openFirstQuestion()}
            >
              開放第 1 題
            </button>
          </>
        }
      />

      <ConfirmDialog
        open={cancelOpen}
        title="取消活動？"
        onClose={closeCancel}
        actions={[
          { label: '繼續準備', onClick: closeCancel },
          { label: '確定取消活動', variant: 'danger', onClick: () => void cancelActivity() },
        ]}
      >
        <p>取消後這個活動就結束了，已加入的學生會回到選組頁，你會回到挑選學習單頁。</p>
      </ConfirmDialog>
    </Shell>
  );
}

function LiveView({ navigate, activity }: ViewProps) {
  const {
    activity: activityService,
    submission: submissionService,
    result: resultService,
  } = useServiceRegistry();
  const questionNumber = activity.currentQuestion ?? 1;
  const question = activity.questions.find((q) => q.number === questionNumber);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [error, setError] = useState<string>();
  const [endOpen, setEndOpen] = useState(false);
  // Stable, so ConfirmDialog keeps one entry for browser back (FR-014).
  const closeEnd = useCallback(() => setEndOpen(false), [setEndOpen]);
  const isLast = activity.questions.at(-1)?.number === questionNumber;
  // A pushed snapshot is newer than the initial list, so a late list must not overwrite it.
  const gotSnapshot = useRef(false);

  useEffect(() => {
    let active = true;
    submissionService
      .listSubmissions(questionNumber)
      .then((list) => {
        if (active && !gotSnapshot.current) setSubmissions(list);
      })
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    resultService
      .getAllResults()
      .then((all) => active && setResults(all))
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    const unsubscribe = submissionService.onSubmissionsChange(questionNumber, (snapshot) => {
      gotSnapshot.current = true;
      setSubmissions(snapshot);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [submissionService, resultService, questionNumber]);

  const judge = async (groupNumber: number, judgement: Judgement) => {
    try {
      const outcome = await submissionService.judge(questionNumber, groupNumber, judgement);
      setError(undefined);
      if (outcome.activity.phase === ActivityPhase.OPEN) {
        setSubmissions(outcome.submissions);
      } else {
        navigateAfterEnd(navigate, outcome.activity);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const endQuestion = async () => {
    // The dialog closes first, so an error shows on T-Live (FR-009).
    setEndOpen(false);
    try {
      const ended = await activityService.endQuestion(questionNumber);
      setError(undefined);
      navigateAfterEnd(navigate, ended);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <Shell navigate={navigate}>
      <div className={styles.intro}>
        <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>
        <h1 className={styles.title}>{questionCountLabel(questionNumber, activity.questions.length)}</h1>
        {question && (
          <p className={styles.lead}>
            第 {questionNumber} 題 · {questionTypeLabel(question)}
          </p>
        )}
      </div>

      <ErrorArea message={error} />

      <dl className={styles.stats}>
        <div>
          <dt>本題已送出</dt>
          <dd>{submissions.length} 組</dd>
        </div>
        <div>
          <dt>還沒送出</dt>
          <dd>{unsubmittedText(activity, submissions)}</dd>
        </div>
        <div>
          <dt>已結束</dt>
          <dd>
            {questionNumber - 1} / {activity.questions.length} 題
          </dd>
        </div>
      </dl>

      <div className={styles.columns}>
        <div className={styles.stack}>
          {question?.text && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>題目</h2>
              <p className={styles.questionText}>{question.text}</p>
            </section>
          )}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>本題搶答順位</h2>
            <SubmissionTable submissions={submissions} onJudge={(g, j) => void judge(g, j)} />
          </section>
        </div>

        <section className={styles.card}>
          <QuestionProgress
            questions={activity.questions}
            results={results}
            currentQuestion={questionNumber}
            groups={activity.groups}
          />
        </section>
      </div>

      <ActionBar
        primary={
          <button type="button" className="btn btn-primary" onClick={() => setEndOpen(true)}>
            結束這一題
          </button>
        }
      />

      <ConfirmDialog
        open={endOpen}
        title={`結束第 ${questionNumber} 題？`}
        onClose={closeEnd}
        actions={[
          { label: '繼續作答', onClick: closeEnd },
          { label: '結束並公布結果', variant: 'primary', onClick: () => void endQuestion() },
        ]}
      >
        <dl className={styles.dialogStats}>
          <div>
            <dt>本題已送出</dt>
            <dd>{submissions.length} 組</dd>
          </div>
          <div>
            <dt>還沒送出</dt>
            <dd>{unsubmittedText(activity, submissions)}</dd>
          </div>
        </dl>
        <p>
          {isLast
            ? '這是最後一題，結束後活動一併結束，會進入結果頁。'
            : `結束後不再接受第 ${questionNumber} 題的送出，並公布本題結果。`}
        </p>
      </ConfirmDialog>
    </Shell>
  );
}

function QuestionEndView({ navigate, activity }: ViewProps) {
  const { activity: activityService, result: resultService } = useServiceRegistry();
  const questionNumber = activity.currentQuestion ?? 1;
  const isLast = activity.questions.at(-1)?.number === questionNumber;
  const [result, setResult] = useState<QuestionResult>();
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    resultService
      .getQuestionResult(questionNumber)
      .then((loaded) => active && setResult(loaded))
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    resultService
      .getAllResults()
      .then((all) => active && setResults(all))
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    return () => {
      active = false;
    };
  }, [resultService, questionNumber]);

  const openNext = async () => {
    try {
      const opened = await activityService.openQuestion(questionNumber + 1);
      setError(undefined);
      navigate({ id: 'T-Live', activity: opened });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <Shell navigate={navigate}>
      <div className={styles.intro}>
        <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>
        <h1 className={styles.title}>第 {questionNumber} 題已結束</h1>
      </div>

      <ErrorArea message={error} />

      <div className={styles.columns}>
        <div className={styles.stack}>
          <section aria-label="本題結果" className={styles.card}>
            <h2 className={styles.cardTitle}>本題結果</h2>
            {result && <QuestionWinner result={result} />}
          </section>
          <dl className={styles.stats}>
            <div>
              <dt>本題已送出</dt>
              <dd>{result ? `${result.submissionCount} 組` : ''}</dd>
            </div>
            <div>
              <dt>已結束</dt>
              <dd>
                {questionNumber} / {activity.questions.length} 題
              </dd>
            </div>
          </dl>
        </div>

        <section className={styles.card}>
          <QuestionProgress
            questions={activity.questions}
            results={results}
            currentQuestion={questionNumber}
            currentEnded
            groups={activity.groups}
          />
        </section>
      </div>

      {/* The last question never ends here: the activity finishes and goes to T-Results. */}
      {!isLast && (
        <ActionBar
          primary={
            <button type="button" className="btn btn-primary" onClick={() => void openNext()}>
              開放第 {questionNumber + 1} 題
            </button>
          }
        />
      )}
    </Shell>
  );
}

export function ConsolePage({ navigate, page }: { navigate: Navigate; page: ConsolePageState }) {
  switch (page.id) {
    case 'T-Lobby':
      return <LobbyView navigate={navigate} activity={page.activity} />;
    case 'T-Live':
      // Keyed by question, so opening the next question starts a fresh view.
      return (
        <LiveView key={page.activity.currentQuestion} navigate={navigate} activity={page.activity} />
      );
    case 'T-QuestionEnd':
      return (
        <QuestionEndView
          key={page.activity.currentQuestion}
          navigate={navigate}
          activity={page.activity}
        />
      );
  }
}
