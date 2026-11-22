import type { ReactNode } from 'react';
import styles from './AppHeader.module.css';

type AppHeaderProps =
  | {
      variant: 'teacher';
      /** Called by the "搶答板" link; only switches page, never calls a service (FR-007). */
      onHome: () => void;
      /** Signed-in account shown on the right, if any. */
      account?: string;
      subtitle?: string;
      children?: ReactNode;
    }
  | {
      variant: 'student';
      /** The joined group, if any. Students get no link back to the home page (FR-007). */
      groupNumber?: number;
      children?: ReactNode;
    };

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" fill="var(--raised)" />
      <path
        d="M6 15.5c2.5-3 4.5-4.5 6.5-4.5"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        stroke="var(--text)"
      />
      <circle cx="16.5" cy="10" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export function AppHeader(props: AppHeaderProps) {
  if (props.variant === 'student') {
    return (
      <header className={`${styles.header} ${styles.student}`}>
        <Logo />
        {props.groupNumber !== undefined ? (
          <span className={styles.group}>第 {props.groupNumber} 組</span>
        ) : (
          <span className={styles.brand}>搶答板</span>
        )}
        {props.children && <div className={styles.end}>{props.children}</div>}
      </header>
    );
  }
  return (
    <header className={`${styles.header} ${styles.teacher}`}>
      <button type="button" className={styles.home} onClick={props.onHome}>
        <Logo />
        <span>搶答板</span>
      </button>
      {props.subtitle && <span className={styles.subtitle}>{props.subtitle}</span>}
      <div className={styles.end}>
        {props.children}
        {props.account && <span className={styles.account}>{props.account}</span>}
      </div>
    </header>
  );
}
