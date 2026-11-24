// S-Join: lists the groups of the current activity, or "no activity" (FR-050), and joins one.
// Where joining leads depends only on the phase joinGroup returns and, while a question is
// open, on this group's submission (research RD-14); the page never derives a phase.
import { useEffect, useState } from 'react';
import { ActivityPhase, type Activity } from '@quiz-buzzer/shared/entities';
import type { Navigate } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { BackButton } from '../../components/BackButton';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { GroupGrid } from '../../components/GroupGrid';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './JoinPage.module.css';

interface JoinPageProps {
  navigate: Navigate;
  previousGroup?: number;
}

export function JoinPage({ navigate, previousGroup }: JoinPageProps) {
  const { activity: activityService, submission: submissionService } = useServiceRegistry();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [selected, setSelected] = useState<number | undefined>(previousGroup);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    activityService.getCurrentActivity().then(
      (current) => {
        if (active) setActivity(current);
      },
      (reason: unknown) => {
        if (active) setError(errorMessage(reason));
      },
    );
    const unsubscribe = activityService.onPhaseChange((next) => setActivity(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activityService]);

  const join = async (groupNumber: number) => {
    try {
      const joined = await activityService.joinGroup(groupNumber);
      switch (joined.phase) {
        case ActivityPhase.OPEN: {
          // A groupmate may already have submitted this question (S10, FR-056a).
          const existing = await submissionService.getGroupSubmission(joined.currentQuestion ?? 1);
          setError(undefined);
          navigate(
            existing
              ? { id: 'S-Submitted', groupNumber, activity: joined, submission: existing }
              : { id: 'S-Answer', groupNumber, activity: joined },
          );
          return;
        }
        case ActivityPhase.QUESTION_ENDED:
          setError(undefined);
          navigate({ id: 'S-QuestionDone', groupNumber, activity: joined });
          return;
        case ActivityPhase.FINISHED:
          setError(undefined);
          navigate({ id: 'S-Results', groupNumber });
          return;
        default:
          setError(undefined);
          navigate({ id: 'S-Wait', groupNumber, activity: joined });
      }
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <>
      <AppHeader variant="student">
        {activity && <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>}
      </AppHeader>
      <main className={styles.main}>
        <ErrorArea message={error} />
        {activity ? (
          <>
            <div className={styles.intro}>
              <h1 className={styles.title}>選擇你的組別</h1>
              <p className={styles.meta}>{activity.questions.length} 題</p>
            </div>
            <GroupGrid groups={activity.groups} selected={selected} onSelect={setSelected} />
            <button
              type="button"
              className={`btn btn-primary ${styles.join}`}
              disabled={selected === undefined}
              onClick={() => selected !== undefined && void join(selected)}
            >
              {selected === undefined ? '加入組別' : `加入第 ${selected} 組`}
            </button>
          </>
        ) : (
          <p className={styles.empty}>目前沒有活動，請等老師建立活動</p>
        )}
        {/* FR-007: lets a user who picked the wrong role go back without any service call.
            Sits under the main button, or under the notice when there is none. */}
        <BackButton onClick={() => navigate({ id: 'Main' })}>返回首頁</BackButton>
      </main>
    </>
  );
}
