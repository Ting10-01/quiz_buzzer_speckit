import { useEffect, useId, type ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions: ConfirmDialogAction[];
  /** Called on Escape or a click on the backdrop. */
  onClose: () => void;
}

/** Open dialogs, oldest first; browser back closes the newest one (FR-014). */
const openDialogs: { close: () => void }[] = [];

/**
 * Closes the topmost open ConfirmDialog as if its cancel-type control was used (onClose).
 * Returns false when no dialog is open. Called by AppRouter on browser back (FR-014).
 */
export function closeTopDialog(): boolean {
  const top = openDialogs.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

export function ConfirmDialog({ open, title, children, actions, onClose }: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const entry = { close: onClose };
    openDialogs.push(entry);
    return () => {
      const index = openDialogs.indexOf(entry);
      if (index !== -1) openDialogs.splice(index, 1);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={styles.scrim}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children && <div className={styles.body}>{children}</div>}
        <div className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`${styles.button} ${styles[action.variant ?? 'secondary']}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
