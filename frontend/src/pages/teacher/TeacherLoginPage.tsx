// T-Login: the only sign-in option is "用 Google 登入" (FR-012); failures stay on the page (FR-013).
// After sign-in the page goes where the current activity is (FR-015, D21), so a teacher who
// reloaded during an activity gets back to the console.
import { useState } from 'react';
import { ActivityPhase, SignInFailure, type Activity } from '@quiz-buzzer/shared/entities';
import type { Navigate, PageState } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { BackButton } from '../../components/BackButton';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './TeacherLoginPage.module.css';

const FAILURE_MESSAGE: Record<SignInFailure, string> = {
  [SignInFailure.CANCELLED]: '已取消登入',
  [SignInFailure.SCOPE_DENIED]: '需要存取雲端硬碟才能讀取學習單。請再按一次「用 Google 登入」，並在 Google 的畫面勾選雲端硬碟檔案那一項。',
};

/** FR-015: the page for the current activity; T-Pick when there is none. */
function destination(activity: Activity | null): PageState {
  if (!activity) return { id: 'T-Pick' };
  switch (activity.phase) {
    case ActivityPhase.PREPARING:
      return { id: 'T-Lobby', activity };
    case ActivityPhase.OPEN:
      return { id: 'T-Live', activity };
    case ActivityPhase.QUESTION_ENDED:
      return { id: 'T-QuestionEnd', activity };
    case ActivityPhase.FINISHED:
      return { id: 'T-Results', activity };
    default:
      return { id: 'T-Pick' };
  }
}

export function TeacherLoginPage({ navigate }: { navigate: Navigate }) {
  const { auth, activity: activityService } = useServiceRegistry();
  const [failure, setFailure] = useState<SignInFailure>();
  const [error, setError] = useState<string>();

  async function signIn() {
    try {
      const result = await auth.signInWithGoogle();
      if (!result.ok) {
        setError(undefined);
        setFailure(result.failure);
        return;
      }
      // A rejection here keeps the teacher on T-Login with the error shown (FR-009).
      const current = await activityService.getCurrentActivity();
      setError(undefined);
      navigate(destination(current));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} subtitle="老師登入" />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>老師登入</h1>
          <p className={styles.lead}>登入後從 Google 雲端硬碟挑選學習單。</p>
          <button type="button" className="btn btn-primary" onClick={signIn}>
            用 Google 登入
          </button>
          {failure && (
            <p className={styles.failure} role="status">
              {FAILURE_MESSAGE[failure]}
            </p>
          )}
        </section>
        {/* FR-007: lets a user who picked the wrong role go back without any service call. */}
        <BackButton onClick={() => navigate({ id: 'Main' })}>返回首頁</BackButton>
        <ErrorArea message={error} />
      </main>
    </div>
  );
}
