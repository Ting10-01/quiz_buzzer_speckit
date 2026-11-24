// The single back-type button centered under the card (research RD-09). Pages with a back and
// a forward button use ActionBar instead.
import type { ReactNode } from 'react';
import styles from './BackButton.module.css';

interface BackButtonProps {
  onClick: () => void;
  children: ReactNode;
}

export function BackButton({ onClick, children }: BackButtonProps) {
  return (
    <button type="button" className={`btn btn-ghost ${styles.back}`} onClick={onClick}>
      {children}
    </button>
  );
}
