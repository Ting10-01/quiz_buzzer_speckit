// Main: choose a role (R1) and see the current activity's phase, question count and group count
// (FR-010). The activity name is never shown (FR-023).
import { useEffect, useState } from 'react';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError } from '@quiz-buzzer/shared/guards';
import type { Navigate } from '../app/AppRouter';
import { AppHeader } from '../components/AppHeader';
import { ErrorArea } from '../components/ErrorArea';
import { PHASE_LABEL } from '../components/phaseLabels';
import { useServiceRegistry } from '../services/ServiceRegistryContext';
import styles from './HomePage.module.css';

export function HomePage({ navigate }: { navigate: Navigate }) {
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
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>課堂搶答</h1>
          <p className={styles.lead}>選擇你的身分。</p>
        </div>

        <ErrorArea message={error} />

        <div className={styles.activity}>
          <span className={styles.label}>目前活動</span>
          {activity ? (
            <>
              <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>
              <span className={styles.meta}>
                {activity.questions.length} 題 · {activity.groupCount} 組
              </span>
            </>
          ) : (
            <span className={styles.none}>目前沒有活動</span>
          )}
        </div>

        <div className={styles.roles}>
          <button type="button" className={styles.role} onClick={() => navigate({ id: 'T-Login' })}>
            <span className={styles.roleName}>我是老師</span>
            <span className={styles.roleHint}>登入後匯入學習單、主持搶答。</span>
          </button>
          <button type="button" className={styles.role} onClick={() => navigate({ id: 'S-Join' })}>
            <span className={styles.roleName}>我是學生</span>
            <span className={styles.roleHint}>選擇組別，以組別為單位作答，不需要登入。</span>
          </button>
        </div>
      </main>
    </div>
  );
}
