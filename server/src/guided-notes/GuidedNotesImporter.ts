import type { ImportError, ImportSuccess, Spreadsheet } from '../temp-shared/entities.js';
import { GuidedNotesParser } from './GuidedNotesParser.js';
import { HeaderLocator } from './HeaderLocator.js';
import { isImportError } from './importErrors.js';
import type { ImportStore } from './ImportStore.js';
import type { LoadedSpreadsheet, SpreadsheetReader } from './SpreadsheetReader.js';

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
  ) {}

  // The spreadsheet after picking: the first worksheet with a header is selected, or the
  // first worksheet when none has one (research R6).
  async describe(spreadsheetId: string): Promise<Spreadsheet> {
    const book = await this.reader.load(spreadsheetId);
    const selected = book.sheets.find((grid) => HeaderLocator.locate(grid) !== null) ?? book.sheets[0];
    return toSpreadsheet(book, selected?.name ?? '');
  }

  async read(spreadsheetId: string, worksheet: string): Promise<ImportSuccess | ImportError> {
    const book = await this.reader.load(spreadsheetId);
    const grid = book.sheets.find((g) => g.name === worksheet);
    if (!grid) throw new Error(`no worksheet ${worksheet}`);
    const result = this.parser.parse(grid, toSpreadsheet(book, worksheet));
    if (!isImportError(result)) this.store.save(result, this.parser.markersOf(grid, result));
    return result;
  }
}
