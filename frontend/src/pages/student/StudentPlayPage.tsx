// StudentPlayPage: the student pages after joining a group. S-Wait (FR-051), S-Answer
// (FR-052–FR-054, FR-056a), S-Submitted (FR-055, FR-056) and S-QuestionDone (FR-057).
// Each page id renders its own view component, so moving between them starts a fresh view.
// Page switches driven by the activity phase follow the spec table "階段推動的切換" through
// onPhaseChange (research RD-12); the page never derives a phase itself (FR-003).
// Students get no way back home once they joined (FR-007), and the rules text and time
// limits of the design are not shown (SC-004).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ActivityPhase, QuestionType, type Activity } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError, isValidationError } from '@quiz-buzzer/shared/guards';
import type { Navigate, PageState } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { questionTypeLabel } from '../../components/questionLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './StudentPlayPage.module.css';

export type StudentPlayState = Extract<
  PageState,
  { id: 'S-Wait' | 'S-Answer' | 'S-Submitted' | 'S-QuestionDone' }
>;

interface StudentPlayPageProps {
  navigate: Navigate;
  page: StudentPlayState;
}

interface ViewProps {
  navigate: Navigate;
  groupNumber: number;
  activity: Activity;
}

function errorMessage(reason: unknown): string {
  return isUnexpectedError(reason) ? reason.message : String(reason);
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
    () => activityService.onPhaseChange((activity) => handlerRef.current(activity)),
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
      <button type="button" className={`btn btn-ghost ${styles.back}`} onClick={() => void chooseAgain()}>
        選錯組別？重新選擇
      </button>
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
        <p className={styles.cardTitle}>
          第 {questionNumber} 題 / 共 {activity.questions.length} 題
        </p>
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

export function StudentPlayPage({ navigate, page }: StudentPlayPageProps) {
  const view = { navigate, groupNumber: page.groupNumber, activity: page.activity };
  switch (page.id) {
    case 'S-Wait':
      return <WaitView {...view} />;
    case 'S-Answer':
      // Keyed by question, so the next question starts with empty answer fields.
      return <AnswerView key={page.activity.currentQuestion} {...view} />;
    default:
      // S-Submitted and S-QuestionDone follow in tasks T088 and T089.
      return null;
  }
}
