// T-Pick: shows the signed-in account and offers the Drive picker (FR-020).
// "Link / unlink Google account" from the T-Connect design is removed (SC-004).
import { useEffect, useState } from 'react';
import type { TeacherAccount } from '@quiz-buzzer/shared/entities';
import type { Navigate } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { BackButton } from '../../components/BackButton';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import { pickToPage } from './importNavigation';
import styles from './PickPage.module.css';

export function PickPage({ navigate }: { navigate: Navigate }) {
  const { auth, guidedNotes } = useServiceRegistry();
  const [account, setAccount] = useState<TeacherAccount | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    auth.getCurrentAccount().then(
      (current) => {
        if (active) setAccount(current);
      },
      (reason: unknown) => {
        if (active) setError(errorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [auth]);

  const pick = async () => {
    try {
      const next = await pickToPage(guidedNotes);
      setError(undefined);
      if (next) navigate(next);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} subtitle="建立活動" />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>從 Google 雲端硬碟匯入學習單</h1>
        </div>

        <ErrorArea message={error} />

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>挑選學習單</h2>
          {account && (
            <div className={styles.account}>
              <span className={styles.accountLabel}>已登入</span>
              <span className={styles.accountName}>{account.name}</span>
              <span className={styles.accountEmail}>{account.email}</span>
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void pick()}>
            從 Google 雲端硬碟挑選
          </button>
        </section>
        <BackButton onClick={() => navigate({ id: 'Main' })}>取消</BackButton>
      </main>
    </div>
  );
}
