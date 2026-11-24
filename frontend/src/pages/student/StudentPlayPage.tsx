// StudentPlayPage: the student pages after joining a group. S-Wait (FR-051), S-Answer
// (FR-052–FR-054, FR-056a), S-Submitted (FR-055, FR-056) and S-QuestionDone (FR-057).
// Each page id renders its own view component, so moving between them starts a fresh view.
// Page switches driven by the activity phase follow the spec table "階段推動的切換" through
// onPhaseChange (research RD-12); the page never derives a phase itself (FR-003).
// Students get no way back home once they joined (FR-007), and the rules text and time
// limits of the design are not shown (SC-004).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityPhase, type Activity } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError } from '@quiz-buzzer/shared/guards';
import type { Navigate, PageState } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { PHASE_LABEL } from '../../components/phaseLabels';
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

export function StudentPlayPage({ navigate, page }: StudentPlayPageProps) {
  const view = { navigate, groupNumber: page.groupNumber, activity: page.activity };
  switch (page.id) {
    case 'S-Wait':
      return <WaitView {...view} />;
    default:
      // S-Answer, S-Submitted and S-QuestionDone follow in tasks T087–T089.
      return null;
  }
}
