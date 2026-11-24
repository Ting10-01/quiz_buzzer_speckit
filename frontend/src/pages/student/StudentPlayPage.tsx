// StudentPlayPage: the student pages after joining a group. S-Wait (FR-051), S-Answer
// (FR-052–FR-054, FR-056a), S-Submitted (FR-055, FR-056) and S-QuestionDone (FR-057).
// Each page id renders its own view component, so moving between them starts a fresh view.
// Page switches driven by the activity phase follow the spec table "階段推動的切換" through
// onPhaseChange (research RD-12); the page never derives a phase itself (FR-003).
// Students get no way back home once they joined (FR-007), and the rules text and time
// limits of the design are not shown (SC-004).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ActivityPhase,
  Judgement,
  QuestionType,
  type Activity,
  type QuestionResult,
  type Submission,
} from '@quiz-buzzer/shared/entities';
import { isValidationError } from '@quiz-buzzer/shared/guards';
import type { Navigate, PageState } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { BackButton } from '../../components/BackButton';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { QuestionProgress } from '../../components/QuestionProgress';
import { questionCountLabel, questionTypeLabel } from '../../components/questionLabels';
import { QuestionWinner } from '../../components/QuestionWinner';
import { answersLabel } from '../../components/submissionLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './StudentPlayPage.module.css';

export type StudentPlayState = Extract<
  PageState,
  { id: 'S-Wait' | 'S-Answer' | 'S-Submitted' | 'S-QuestionDone' }
>;

interface StudentPlayPageProps {
  navigate: Navigate;
  page: StudentPlayState;
  /**
   * Reports whether S-Submitted is waiting for a judgement, so AppRouter can tell the mock
   * control bar (FR-061: "模擬：接受" and "模擬：不接受" only appear then).
   */
  onAwaitingJudgementChange?: (awaiting: boolean) => void;
}

interface ViewProps {
  navigate: Navigate;
  groupNumber: number;
  activity: Activity;
}

/**
 * Subscribes to phase changes for the life of the view. The handler is kept in a ref so the
 * subscription is made once, while the handler always sees the latest state.
 */
function usePhaseChange(handler: (activity: Activity) => void) {
  const { activity: activityService } = useServiceRegistry();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(
    // TODO(T155): remove this cast; null still reaches the views until then.
    () => activityService.onPhaseChange((activity) => handlerRef.current(activity as Activity)),
    [activityService],
  );
}

/**
 * S-Answer and S-Submitted when the question ends: S-QuestionDone, or S-Results when the
 * activity finished (the last question skips S-QuestionDone, M7). Returns false otherwise.
 */
function navigateWhenQuestionEnds(navigate: Navigate, groupNumber: number, next: Activity): boolean {
  if (next.phase === ActivityPhase.QUESTION_ENDED) {
    navigate({ id: 'S-QuestionDone', groupNumber, activity: next });
    return true;
  }
  if (next.phase === ActivityPhase.FINISHED) {
    navigate({ id: 'S-Results', groupNumber });
    return true;
  }
  return false;
}

/** The answer index a ValidationError field such as "answers.1" points at; 0 otherwise. */
function answerIndex(field: string): number {
  const match = /^answers\.(\d+)$/.exec(field);
  return match ? Number(match[1]) : 0;
}

function Shell({
  groupNumber,
  phase,
  children,
}: {
  groupNumber: number;
  phase: ActivityPhase;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader variant="student" groupNumber={groupNumber}>
        <span className={styles.phase}>{PHASE_LABEL[phase]}</span>
      </AppHeader>
      <main className={styles.main}>{children}</main>
    </>
  );
}

function WaitView({ navigate, groupNumber, activity }: ViewProps) {
  const { activity: activityService } = useServiceRegistry();
  const [error, setError] = useState<string>();

  // Students only wait here while PREPARING; the first question opening moves them on.
  usePhaseChange((next) => {
    if (next.phase === ActivityPhase.OPEN) {
      navigate({ id: 'S-Answer', groupNumber, activity: next });
    }
  });

  const chooseAgain = async () => {
    try {
      await activityService.leaveGroup();
      setError(undefined);
      navigate({ id: 'S-Join', previousGroup: groupNumber });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <Shell groupNumber={groupNumber} phase={activity.phase}>
      <ErrorArea message={error} />
      <section className={styles.card}>
        <h1 className={styles.title}>等老師開放第 1 題</h1>
        {/* FR-051: only the place for this round's notes; their wording belongs to 004 and 005. */}
        <section aria-label="這一輪" className={styles.notes}>
          <h2 className={styles.cardTitle}>這一輪</h2>
          <p className={styles.muted}>共 {activity.questions.length} 題</p>
        </section>
      </section>
      {/* The page's only back-type button sits right under the card (RD-09). */}
      <BackButton onClick={() => void chooseAgain()}>選錯組別？重新選擇</BackButton>
    </Shell>
  );
}

function AnswerView({ navigate, groupNumber, activity }: ViewProps) {
  const { submission: submissionService } = useServiceRegistry();
  const questionNumber = activity.currentQuestion ?? 1;
  const question = activity.questions.find((q) => q.number === questionNumber);
  const subQuestions = question?.subQuestions ?? [];
  const [answers, setAnswers] = useState<string[]>(() => subQuestions.map(() => ''));
  const [fieldError, setFieldError] = useState<{ index: number; message: string }>();
  const [error, setError] = useState<string>();
  const idPrefix = useId();

  usePhaseChange((next) => {
    navigateWhenQuestionEnds(navigate, groupNumber, next);
  });

  // FR-056a: a groupmate's submission counts for the whole group.
  useEffect(
    () =>
      submissionService.onGroupSubmitted((submission) =>
        navigate({ id: 'S-Submitted', groupNumber, activity, submission }),
      ),
    [submissionService, navigate, groupNumber, activity],
  );

  const submit = async () => {
    try {
      const result = await submissionService.submitAnswer(questionNumber, answers);
      setError(undefined);
      if (isValidationError(result)) {
        setFieldError({ index: answerIndex(result.field), message: result.message });
        return;
      }
      setFieldError(undefined);
      navigate({ id: 'S-Submitted', groupNumber, activity, submission: result });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const isGroup = question?.type === QuestionType.GROUP;

  return (
    <Shell groupNumber={groupNumber} phase={activity.phase}>
      <ErrorArea message={error} />
      <section className={styles.card}>
        <p className={styles.cardTitle}>{questionCountLabel(questionNumber, activity.questions.length)}</p>
        {question && <p className={styles.muted}>{questionTypeLabel(question)}</p>}
        {question?.text && <p className={styles.questionText}>{question.text}</p>}
      </section>
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {subQuestions.map((sub, i) => {
          const inputId = `${idPrefix}-answer-${i}`;
          const errorId = `${idPrefix}-error-${i}`;
          const hasError = fieldError?.index === i;
          return (
            <div key={sub.index} className={styles.field}>
              <label htmlFor={inputId} className={styles.fieldLabel}>
                {isGroup ? `第 ${sub.index} 小題` : '答案'}
              </label>
              <input
                id={inputId}
                className={styles.input}
                value={answers[i] ?? ''}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? errorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setAnswers((current) => current.map((a, j) => (j === i ? value : a)));
                }}
              />
              {hasError && (
                <span id={errorId} className={styles.fieldError}>
                  {fieldError.message}
                </span>
              )}
            </div>
          );
        })}
        {/* FR-053: one hint area; its wording and when the button is enabled belong to 005. */}
        <p role="status" aria-label="送出提示" className={styles.hint} />
        {/* The button acts on the answer form only, so it stays inside it (RD-09). */}
        <button type="submit" className={`btn btn-primary ${styles.wide}`}>
          整組送出
        </button>
      </form>
    </Shell>
  );
}

interface SubmittedViewProps extends ViewProps {
  submission: Submission;
  onAwaitingJudgementChange?: (awaiting: boolean) => void;
}

function SubmittedView({
  navigate,
  groupNumber,
  activity,
  submission,
  onAwaitingJudgementChange,
}: SubmittedViewProps) {
  const { submission: submissionService } = useServiceRegistry();
  // S10: a groupmate's submission may already have been rejected when this tab joined.
  const [rejected, setRejected] = useState(submission.judgement === Judgement.REJECTED);

  // Accepting ends the question; the switch comes from the phase change, not the judgement
  // (FR-055, RD-12), so ACCEPTED shows no state of its own.
  useEffect(
    () =>
      submissionService.onJudgement((judged) => {
        if (judged.judgement === Judgement.REJECTED) setRejected(true);
      }),
    [submissionService],
  );

  usePhaseChange((next) => {
    navigateWhenQuestionEnds(navigate, groupNumber, next);
  });

  useEffect(() => {
    onAwaitingJudgementChange?.(!rejected);
  }, [onAwaitingJudgementChange, rejected]);
  useEffect(() => () => onAwaitingJudgementChange?.(false), [onAwaitingJudgementChange]);

  return (
    <Shell groupNumber={groupNumber} phase={activity.phase}>
      <section className={styles.card}>
        <p className={styles.cardTitle}>第 {submission.questionNumber} 題</p>
        {/* FR-056: once rejected the group cannot submit again, so nothing here is editable. */}
        <h1 className={rejected ? `${styles.title} ${styles.rejected}` : styles.title}>
          {rejected ? '老師沒有接受本組的答案' : '等待老師判定'}
        </h1>
        <section aria-label="本組送出的答案" className={styles.notes}>
          <h2 className={styles.cardTitle}>本組送出的答案</h2>
          <p className={styles.answers}>{answersLabel(submission.answers)}</p>
        </section>
      </section>
    </Shell>
  );
}

function QuestionDoneView({ navigate, groupNumber, activity }: ViewProps) {
  const { result: resultService } = useServiceRegistry();
  const questionNumber = activity.currentQuestion ?? 1;
  const [result, setResult] = useState<QuestionResult>();
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [error, setError] = useState<string>();

  // C-2: what a student may see is filtered by the result service, never by this page.
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

  usePhaseChange((next) => {
    if (next.phase === ActivityPhase.OPEN) {
      navigate({ id: 'S-Answer', groupNumber, activity: next });
    }
  });

  const mine = result?.submissions.find((s) => s.groupNumber === groupNumber);

  return (
    <Shell groupNumber={groupNumber} phase={activity.phase}>
      <ErrorArea message={error} />
      <h1 className={styles.title}>第 {questionNumber} 題已結束</h1>
      <section aria-label="本題結果" className={styles.card}>
        <h2 className={styles.cardTitle}>本題結果</h2>
        {result && (
          <QuestionWinner result={result} isOwnGroup={result.winner?.groupNumber === groupNumber} />
        )}
        <dl className={styles.stats}>
          <div>
            <dt>本題已送出</dt>
            <dd>{result ? `${result.submissionCount} 組` : ''}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="本組的答案" className={styles.card}>
        <h2 className={styles.cardTitle}>本組的答案</h2>
        {result && (
          <p className={mine ? styles.answers : styles.muted}>
            {mine ? answersLabel(mine.answers) : '本組沒有送出'}
          </p>
        )}
      </section>
      <section className={styles.card}>
        <QuestionProgress
          questions={activity.questions}
          results={results}
          currentQuestion={questionNumber}
          currentEnded
        />
      </section>
    </Shell>
  );
}

export function StudentPlayPage({ navigate, page, onAwaitingJudgementChange }: StudentPlayPageProps) {
  const view = { navigate, groupNumber: page.groupNumber, activity: page.activity };
  switch (page.id) {
    case 'S-Wait':
      return <WaitView {...view} />;
    case 'S-Answer':
      // Keyed by question, so the next question starts with empty answer fields.
      return <AnswerView key={page.activity.currentQuestion} {...view} />;
    case 'S-Submitted':
      return (
        <SubmittedView
          key={page.activity.currentQuestion}
          {...view}
          submission={page.submission}
          onAwaitingJudgementChange={onAwaitingJudgementChange}
        />
      );
    case 'S-QuestionDone':
      return <QuestionDoneView key={page.activity.currentQuestion} {...view} />;
  }
}
