// Worksheet preview (FR-021): built only from the recognition result, so cells outside it
// are never shown. T-Results passes `filled` to preview what write-back will put in each cell;
// it has the activity's questions but not the import's header row, so the header is optional (C-5).
// The columns follow what was recognised: no text column when the sheet has none (FR-021, #16).
import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import styles from './SheetPreview.module.css';

interface SheetPreviewProps {
  /** Questions to preview; without the header row and columns, generic column names are used. */
  result: Pick<ImportSuccess, 'questions'> &
    Partial<Pick<ImportSuccess, 'headerRow' | 'headerColumns'>>;
  /** Content per blank cell, e.g. { G5: 'CPU' }; blank cells without an entry stay empty. */
  filled?: Record<string, string>;
}

type ColumnKind = 'number' | 'text' | 'answer';

const COLUMN_NAMES: Record<ColumnKind, string> = { number: '題號', text: '題目', answer: '作答' };

export interface RecognisedColumn {
  kind: ColumnKind;
  /** Column letter, e.g. "B". */
  letter: string;
  /** "題號", "題目" or "作答". */
  name: string;
}

/**
 * What each of `headerColumns` was recognised as. They are in the order number, text (only when
 * the sheet has one) and answer (003 data-model), so two columns mean there is no text column (#16).
 */
export function recognisedColumns(headerColumns: string[]): RecognisedColumn[] {
  const kinds: ColumnKind[] = headerColumns.length >= 3 ? ['number', 'text', 'answer'] : ['number', 'answer'];
  return kinds.map((kind, i) => ({ kind, letter: headerColumns[i] ?? '', name: COLUMN_NAMES[kind] }));
}

/** Row number of a cell reference such as "G5"; the preview has no other source of rows. */
function rowOf(cell: string): string {
  return cell.match(/\d+$/)?.[0] ?? '';
}

export function SheetPreview({ result, filled }: SheetPreviewProps) {
  const hasHeader = result.headerRow !== undefined && result.headerColumns !== undefined;
  // Without the import's header (T-Results, C-5), three columns with generic names are shown.
  const columns = hasHeader
    ? recognisedColumns(result.headerColumns ?? [])
    : recognisedColumns(['題號', '題目', '作答']).map((column) => ({ ...column, letter: column.name }));
  const hasText = columns.some((column) => column.kind === 'text');
  return (
    <section aria-label="學習單預覽" className={styles.preview}>
      <table className={styles.sheet}>
        <thead>
          <tr>
            <th scope="col" className={styles.rowHead} aria-label="列" />
            {columns.map((column) => (
              <th key={column.kind} scope="col">
                {column.letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasHeader && (
            <tr className={styles.headerRow}>
              <th scope="row" className={styles.rowHead}>
                {result.headerRow}
              </th>
              {/* The result has no header texts, so the row names what each column was recognised as. */}
              {columns.map((column) => (
                <td key={column.kind}>{column.name}欄</td>
              ))}
            </tr>
          )}
          {result.questions.flatMap((question) =>
            question.subQuestions.map((sub, i) => (
              <tr key={`${question.number}-${sub.index}`}>
                <th scope="row" className={styles.rowHead}>
                  {rowOf(sub.blankCell)}
                </th>
                {i === 0 && (
                  <>
                    <td rowSpan={question.subQuestions.length} className={styles.number}>
                      {question.number}
                    </td>
                    {hasText && (
                      <td rowSpan={question.subQuestions.length} className={styles.text}>
                        {question.text}
                      </td>
                    )}
                  </>
                )}
                <td className={styles.blank}>
                  <span className={styles.cellRef}>{sub.blankCell}</span>
                  {filled?.[sub.blankCell] && (
                    <span className={styles.filled}>{filled[sub.blankCell]}</span>
                  )}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p className={styles.legend}>黃框是搶答結束後會寫回答案的填空格。</p>
    </section>
  );
}
