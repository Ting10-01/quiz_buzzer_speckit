import type { ImportError, ImportSuccess, Spreadsheet } from '../temp-shared/entities.js';
import { HeaderLocator } from './HeaderLocator.js';
import { isImportError, noHeader } from './importErrors.js';
import { QuestionScanner } from './QuestionScanner.js';
import { columnLetters, type SheetGrid } from './SheetGrid.js';

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

    const columns = [header.numberCol, header.questionCol, header.answerCol].filter((c) => c !== undefined);
    return {
      spreadsheet: structuredClone(spreadsheet),
      headerRow: header.row,
      headerColumns: columns.map(columnLetters),
      questions: scanned.map((s) => s.question),
    };
  }
}
