import type { PageId } from '../app/AppRouter';
import { useServiceRegistry } from '../services/ServiceRegistryContext';
import { MockControlBar } from './MockControlBar';
import styles from './MockModeBadge.module.css';

interface MockModeBadgeProps {
  page: PageId;
  awaitingJudgement: boolean;
}

/** Fixed "模擬模式" label with the mock control bar beside it (FR-005, FR-061). */
export function MockModeBadge({ page, awaitingJudgement }: MockModeBadgeProps) {
  const registry = useServiceRegistry();
  if (!registry.isMockMode()) return null;
  return (
    <aside className={styles.dock}>
      <MockControlBar page={page} awaitingJudgement={awaitingJudgement} />
      <span className={styles.badge}>模擬模式</span>
    </aside>
  );
}
