import type { SheetGrid } from './SheetGrid.js';

// The header row and its columns, all 1-based. questionCol is absent without a question column.
export interface HeaderMatch {
  row: number;
  numberCol: number;
  answerCol: number;
  questionCol?: number;
}

// NFKC folds full-width forms; trim() also removes the full-width space U+3000.
function normalize(text: string): string {
  return text.normalize('NFKC').trim();
}

// Finds the header row at run time (research R3, constitution IV): no fixed cell positions.
export class HeaderLocator {
  static readonly NUMBER_HEADERS: readonly string[] = ['題號', '編號', '題次'];
  static readonly ANSWER_HEADERS: readonly string[] = ['作答', '答案', '回答'];
  static readonly QUESTION_HEADERS: readonly string[] = ['題目', '問題', '題幹'];

  // The first row, top to bottom, that has both a number header and an answer header.
  // A header text must equal one of the accepted texts exactly after trimming.
  static locate(grid: SheetGrid): HeaderMatch | null {
    for (let row = 1; row <= grid.rowCount; row++) {
      let numberCol: number | undefined;
      let answerCol: number | undefined;
      let questionCol: number | undefined;
      for (let col = 1; col <= grid.colCount; col++) {
        const text = normalize(grid.text(row, col));
        if (!text) continue;
        // A merged header cell counts as its leftmost column.
        const leftmost = grid.mergeAt(row, col)?.startCol ?? col;
        if (numberCol === undefined && HeaderLocator.NUMBER_HEADERS.includes(text)) numberCol = leftmost;
        else if (answerCol === undefined && HeaderLocator.ANSWER_HEADERS.includes(text)) answerCol = leftmost;
        else if (questionCol === undefined && HeaderLocator.QUESTION_HEADERS.includes(text)) questionCol = leftmost;
      }
      if (numberCol !== undefined && answerCol !== undefined) {
        return questionCol === undefined ? { row, numberCol, answerCol } : { row, numberCol, answerCol, questionCol };
      }
    }
    return null;
  }

  // For NO_HEADER: the texts, left to right, of the first row with at least two non-blank
  // cells (a one-cell title row is skipped); [] when there is no such row.
  static currentHeaderTexts(grid: SheetGrid): string[] {
    for (let row = 1; row <= grid.rowCount; row++) {
      const texts: string[] = [];
      for (let col = 1; col <= grid.colCount; col++) {
        const text = grid.text(row, col).trim();
        if (text) texts.push(text);
      }
      if (texts.length >= 2) return texts;
    }
    return [];
  }
}
