// Bottom action bar (research RD-09): a page's pair of back and forward buttons always sits in
// the same fixed place, back-type on the left and the main button on the right.
// Buttons that act on one section stay in that section instead.
import type { ReactNode } from 'react';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  /** Back-type button(s), shown on the left. */
  back?: ReactNode;
  /** Main button(s), shown on the right. */
  primary?: ReactNode;
}

export function ActionBar({ back, primary }: ActionBarProps) {
  return (
    // data-action-bar lets the mock dock move above the bar (MockModeBadge.module.css).
    <div className={styles.bar} data-action-bar="">
      <div className={styles.inner}>
        <div className={styles.side}>{back}</div>
        <div className={styles.side}>{primary}</div>
      </div>
    </div>
  );
}
