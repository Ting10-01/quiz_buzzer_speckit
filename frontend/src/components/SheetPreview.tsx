// Worksheet preview (FR-021): built only from the recognition result, so cells outside it
// are never shown. T-Results passes `filled` to preview what write-back will put in each cell.
import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import styles from './SheetPreview.module.css';

interface SheetPreviewProps {
  result: ImportSuccess;
  /** Content per blank cell, e.g. { G5: 'CPU' }; blank cells without an entry stay empty. */
  filled?: Record<string, string>;
}

/** Row number of a cell reference such as "G5"; the preview has no other source of rows. */
function rowOf(cell: string): string {
  return cell.match(/\d+$/)?.[0] ?? '';
}

export function SheetPreview({ result, filled }: SheetPreviewProps) {
  const [numberColumn, textColumn, answerColumn] = result.headerColumns;
  return (
    <section aria-label="學習單預覽" className={styles.preview}>
      <table className={styles.sheet}>
        <thead>
          <tr>
            <th scope="col" className={styles.rowHead} aria-label="列" />
            <th scope="col">{numberColumn}</th>
            <th scope="col">{textColumn}</th>
            <th scope="col">{answerColumn}</th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.headerRow}>
            <th scope="row" className={styles.rowHead}>
              {result.headerRow}
            </th>
            {/* The result has no header texts, so the row names what each column was recognised as. */}
            <td>題號欄</td>
            <td>題目欄</td>
            <td>作答欄</td>
          </tr>
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
                    <td rowSpan={question.subQuestions.length} className={styles.text}>
                      {question.text}
                    </td>
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
