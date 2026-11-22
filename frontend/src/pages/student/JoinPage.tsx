// S-Join: lists the groups of the current activity, or "no activity" (FR-050).
// Selecting and joining a group is completed in US4 (tasks T085).
import { useEffect, useState } from 'react';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError } from '@quiz-buzzer/shared/guards';
import type { Navigate } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { GroupGrid } from '../../components/GroupGrid';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './JoinPage.module.css';

interface JoinPageProps {
  navigate: Navigate;
  previousGroup?: number;
}

export function JoinPage({ navigate }: JoinPageProps) {
  void navigate;
  const { activity: activityService } = useServiceRegistry();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    activityService.getCurrentActivity().then(
      (current) => {
        if (active) setActivity(current);
      },
      (reason: unknown) => {
        if (active) setError(isUnexpectedError(reason) ? reason.message : String(reason));
      },
    );
    const unsubscribe = activityService.onPhaseChange((next) => setActivity(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activityService]);

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
            <GroupGrid groups={activity.groups} />
          </>
        ) : (
          <p className={styles.empty}>目前沒有活動，請等老師建立活動</p>
        )}
      </main>
    </>
  );
}
