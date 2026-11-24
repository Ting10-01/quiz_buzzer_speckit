// T-Login: the only sign-in option is "用 Google 登入" (FR-012); failures stay on the page (FR-013).
import { useState } from 'react';
import { SignInFailure } from '@quiz-buzzer/shared/entities';
import type { Navigate } from '../../app/AppRouter';
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
