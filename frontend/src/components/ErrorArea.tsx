import styles from './ErrorArea.module.css';

/** Shared area for unexpected service errors on every page (FR-009). Renders nothing without a message. */
export function ErrorArea({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className={styles.error}>
      {message}
    </div>
  );
}
