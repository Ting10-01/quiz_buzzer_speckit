// T-Login: the only sign-in option is "用 Google 登入" (FR-012); failures stay on the page (FR-013).
import { useState } from 'react';
import { SignInFailure } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError } from '@quiz-buzzer/shared/guards';
import type { Navigate } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './TeacherLoginPage.module.css';

const FAILURE_MESSAGE: Record<SignInFailure, string> = {
  [SignInFailure.CANCELLED]: '已取消登入',
  [SignInFailure.NOT_TEACHER]: '此帳號不是老師帳號',
};

export function TeacherLoginPage({ navigate }: { navigate: Navigate }) {
  const { auth } = useServiceRegistry();
  const [failure, setFailure] = useState<SignInFailure>();
  const [error, setError] = useState<string>();

  async function signIn() {
    try {
      const result = await auth.signInWithGoogle();
      setError(undefined);
      if (result.ok) {
        navigate({ id: 'T-Pick' });
      } else {
        setFailure(result.failure);
      }
    } catch (reason) {
      setError(isUnexpectedError(reason) ? reason.message : String(reason));
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
        <ErrorArea message={error} />
      </main>
    </div>
  );
}
