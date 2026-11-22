import type { Group } from '@quiz-buzzer/shared/entities';
import styles from './GroupGrid.module.css';

interface GroupGridProps {
  groups: Group[];
  selected?: number;
  /** Without onSelect the grid is display-only. */
  onSelect?: (groupNumber: number) => void;
}

function memberText(count: number) {
  return count === 0 ? '還沒有人' : `已加入 ${count} 人`;
}

export function GroupGrid({ groups, selected, onSelect }: GroupGridProps) {
  if (onSelect) {
    return (
      <div role="radiogroup" aria-label="組別" className={styles.grid}>
        {groups.map((group) => (
          <button
            key={group.number}
            type="button"
            role="radio"
            aria-checked={group.number === selected}
            className={`${styles.cell} ${styles.selectable}`}
            onClick={() => onSelect(group.number)}
          >
            <span className={styles.name}>第 {group.number} 組</span>
            <span className={styles.count}>{memberText(group.memberCount)}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <ul aria-label="組別" className={styles.grid}>
      {groups.map((group) => (
        <li key={group.number} className={styles.cell}>
          <span className={styles.name}>第 {group.number} 組</span>
          <span className={styles.count}>{memberText(group.memberCount)}</span>
        </li>
      ))}
    </ul>
  );
}
