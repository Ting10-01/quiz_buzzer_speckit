import type { ImportError, ImportSuccess, Spreadsheet } from '@quiz-buzzer/shared/entities';
import { HeaderLocator } from './HeaderLocator.js';
import type { BlankMarkers } from './ImportStore.js';
import { invalidNumbering, isImportError, noHeader, noQuestions, tooManyQuestions } from './importErrors.js';
import { QuestionScanner } from './QuestionScanner.js';
import { columnLetters, type SheetGrid } from './SheetGrid.js';

const MAX_QUESTIONS = 200;

// Turns one worksheet into an ImportSuccess or ImportError. Stateless and offline: it never
// calls Google and never touches the ImportStore. 006 uses it for the layout check.
export class GuidedNotesParser {
  private readonly scanner = new QuestionScanner();

  // `spreadsheet` is only copied into the result.
  parse(grid: SheetGrid, spreadsheet: Spreadsheet): ImportSuccess | ImportError {
    const header = HeaderLocator.locate(grid);
    if (!header) return noHeader(grid.name, HeaderLocator.currentHeaderTexts(grid));

    const scanned = this.scanner.scan(grid, header);
    if (isImportError(scanned)) return scanned;
    if (scanned.length === 0) return noQuestions(grid.name, header.row);
    if (scanned.length > MAX_QUESTIONS) return tooManyQuestions(scanned.length);
    // Numbers must strictly increase from top to bottom; gaps are fine (research R5).
    for (let i = 1; i < scanned.length; i++) {
      const previous = scanned[i - 1]!;
      const current = scanned[i]!;
      if (current.question.number <= previous.question.number) {
        return invalidNumbering(current.question.number, current.row, { number: previous.question.number, row: previous.row });
      }
    }

    const columns = [header.numberCol, header.questionCol, header.answerCol].filter((c) => c !== undefined);
    return {
      spreadsheet: structuredClone(spreadsheet),
      headerRow: header.row,
      headerColumns: columns.map(columnLetters),
      questions: scanned.map((s) => s.question),
    };
  }

  // The marker at the start of every blank cell of `result` (exactly one entry per blankCell).
  markersOf(grid: SheetGrid, result: ImportSuccess): BlankMarkers {
    const cells = result.questions.flatMap((q) => q.subQuestions.map((s) => s.blankCell));
    return Object.fromEntries(cells.map((cell) => [cell, QuestionScanner.extractMarker(grid.textA1(cell))]));
  }
}
