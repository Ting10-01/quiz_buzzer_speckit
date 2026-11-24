// Bottom action bar (research RD-09): a page's back and forward buttons always sit in the same
// fixed place. Buttons that leave the current flow (back, cancel) go on the left; buttons that
// move forward or stay in the flow go on the right, with the primary button rightmost.
// Buttons that act on one section stay in that section instead.
import type { ReactNode } from 'react';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  /** Button(s) that leave the current flow (back, cancel), shown on the left. */
  back?: ReactNode;
  /** Button(s) that move forward or stay in the flow, shown on the right; primary last. */
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
