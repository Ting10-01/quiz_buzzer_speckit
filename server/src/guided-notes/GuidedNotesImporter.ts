import type { FastifyBaseLogger } from 'fastify';
import type { ImportError, ImportSuccess, Spreadsheet } from '../temp-shared/entities.js';
import { GuidedNotesParser } from './GuidedNotesParser.js';
import { HeaderLocator } from './HeaderLocator.js';
import { isImportError, noAccess, noWorksheet } from './importErrors.js';
import type { ImportStore } from './ImportStore.js';
import { SheetsReadError, type LoadedSpreadsheet, type SpreadsheetReader } from './SpreadsheetReader.js';

function toSpreadsheet(book: LoadedSpreadsheet, selectedWorksheet: string): Spreadsheet {
  return {
    id: book.id,
    title: book.title,
    editable: book.editable,
    worksheets: book.sheets.map((s) => s.name),
    selectedWorksheet,
  };
}

// The two server operations behind 001's GuidedNotesService. Only read() changes the ImportStore.
export class GuidedNotesImporter {
  private readonly parser = new GuidedNotesParser();

  constructor(
    private readonly reader: SpreadsheetReader,
    private readonly store: ImportStore,
    private readonly log: FastifyBaseLogger,
  ) {}

  // The spreadsheet after picking: the first worksheet with a header is selected, or the
  // first worksheet when none has one (research R6).
  async describe(spreadsheetId: string): Promise<Spreadsheet> {
    const book = await this.reader.load(spreadsheetId);
    const selected = book.sheets.find((grid) => HeaderLocator.locate(grid) !== null) ?? book.sheets[0];
    return toSpreadsheet(book, selected?.name ?? '');
  }

  // Every failure leaves the ImportStore unchanged (REQ-IMP-14). NO_ACCESS is an ImportError here;
  // other SheetsReadErrors and TeacherNotSignedInError are thrown for the route to answer.
  // Logs only ids, the worksheet name and the outcome: never cell contents or tokens (constitution VI).
  async read(spreadsheetId: string, worksheet: string): Promise<ImportSuccess | ImportError> {
    const context = { spreadsheetId, worksheet };
    try {
      const result = await this.readWorksheet(spreadsheetId, worksheet);
      const outcome = isImportError(result) ? { code: result.code } : { questionCount: result.questions.length };
      this.log.info({ ...context, ...outcome }, 'guided notes read');
      return result;
    } catch (error) {
      const code = error instanceof SheetsReadError ? error.kind : (error as { code?: unknown } | null)?.code;
      this.log.warn({ ...context, code }, 'guided notes read failed');
      throw error;
    }
  }

  private async readWorksheet(spreadsheetId: string, worksheet: string): Promise<ImportSuccess | ImportError> {
    let book: LoadedSpreadsheet;
    try {
      book = await this.reader.load(spreadsheetId);
    } catch (error) {
      if (error instanceof SheetsReadError && error.kind === 'NO_ACCESS') return noAccess();
      throw error;
    }
    const grid = book.sheets.find((g) => g.name === worksheet);
    if (!grid) return noWorksheet(worksheet);
    const result = this.parser.parse(grid, toSpreadsheet(book, worksheet));
    if (!isImportError(result)) this.store.save(result, this.parser.markersOf(grid, result));
    return result;
  }
}
