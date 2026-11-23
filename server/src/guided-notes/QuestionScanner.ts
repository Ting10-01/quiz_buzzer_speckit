import type { ImportError, Question, SubQuestion } from '../temp-shared/entities.js';
import type { HeaderMatch } from './HeaderLocator.js';
import type { SheetGrid } from './SheetGrid.js';

// A question and the row of its number cell (for error messages).
export interface ScannedQuestion {
  row: number;
  question: Question;
}

// A positive integer: a number value (1, 1.0) or a text of digits ("1", full-width "１").
// Anything else (0, negative, 1.5, other text, blank) is not a question number.
function questionNumber(grid: SheetGrid, row: number, col: number): number | null {
  const value = grid.number(row, col);
  if (value !== null) return Number.isInteger(value) && value >= 1 ? value : null;
  const text = grid.text(row, col).normalize('NFKC').trim();
  return /^\d+$/.test(text) && Number(text) >= 1 ? Number(text) : null;
}

// The trimmed text of the question cell in `row` (top-left of a merge starting in that row).
// A cell covered by a merge from an earlier row has no text of its own.
function questionText(grid: SheetGrid, row: number, col: number | undefined): string {
  if (col === undefined) return '';
  const merge = grid.mergeAt(row, col);
  if (merge && merge.startRow < row) return '';
  return grid.text(row, merge?.startCol ?? col).trim();
}

// A sub-question marker at the start of a blank cell: "（1）", "(1)" or mixed "（1)".
const MARKER = /^\s*([（(]\s*\d+\s*[)）])/;

// Reads the questions below the header row (research R4).
export class QuestionScanner {
  // The marker kept as written (without leading spaces), or "" when there is none.
  static extractMarker(text: string): string {
    return MARKER.exec(text)?.[1] ?? '';
  }

  scan(grid: SheetGrid, header: HeaderMatch): ScannedQuestion[] | ImportError {
    const scanned: ScannedQuestion[] = [];
    for (let row = header.row + 1; row <= grid.rowCount; row++) {
      const numberMerge = grid.mergeAt(row, header.numberCol);
      if (numberMerge && numberMerge.startRow < row) continue;
      const number = questionNumber(grid, row, header.numberCol);
      if (number === null) continue;

      // A number cell merged over several rows is a group: each row is a candidate sub-question.
      const lastRow = numberMerge?.endRow ?? row;
      const isGroup = lastRow > row;
      const subQuestions: SubQuestion[] = [];
      const lines: string[] = [];
      for (let r = row; r <= lastRow; r++) {
        const answerMerge = grid.mergeAt(r, header.answerCol);
        // An answer cell merged with the row above is not a blank cell of its own.
        if (answerMerge && answerMerge.startRow < r) continue;
        const blankCell = answerMerge
          ? grid.toA1(answerMerge.startRow, answerMerge.startCol)
          : grid.toA1(r, header.answerCol);
        const index = subQuestions.length + 1;
        subQuestions.push({ index, blankCell });
        const text = questionText(grid, r, header.questionCol);
        if (!text) continue;
        // A group line starts with the sub-question's marker, or "（n）" when the cell has none.
        const marker = isGroup ? QuestionScanner.extractMarker(grid.textA1(blankCell)) || `（${index}）` : '';
        lines.push(marker + text);
      }
      const question: Question = { number, type: isGroup ? 'GROUP' : 'SINGLE', subQuestions };
      if (lines.length > 0) question.text = lines.join('\n');
      scanned.push({ row, question });
    }
    return scanned;
  }
}
