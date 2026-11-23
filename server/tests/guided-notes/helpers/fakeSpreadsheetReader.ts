import type { sheets_v4 } from '@googleapis/sheets';
import { toLoadedSpreadsheet } from '../../../src/guided-notes/GoogleSheetsReader.js';
import { SheetsReadError, type LoadedSpreadsheet, type SpreadsheetReader } from '../../../src/guided-notes/SpreadsheetReader.js';

// SpreadsheetReader without Google: answers from spreadsheets.get-shaped fixtures.
// Unknown ids fail with SheetsReadError('NO_ACCESS'), as Google answers 404.
export class FakeSpreadsheetReader implements SpreadsheetReader {
  readonly loadCalls: string[] = [];
  private readonly answers = new Map<string, { book: sheets_v4.Schema$Spreadsheet; editable: boolean } | Error>();

  set(spreadsheetId: string, book: sheets_v4.Schema$Spreadsheet, editable = true): this {
    this.answers.set(spreadsheetId, { book, editable });
    return this;
  }

  // Every later load of `spreadsheetId` rejects with `error`.
  fail(spreadsheetId: string, error: Error): this {
    this.answers.set(spreadsheetId, error);
    return this;
  }

  async load(spreadsheetId: string): Promise<LoadedSpreadsheet> {
    this.loadCalls.push(spreadsheetId);
    const answer = this.answers.get(spreadsheetId) ?? new SheetsReadError('NO_ACCESS');
    if (answer instanceof Error) throw answer;
    return toLoadedSpreadsheet(spreadsheetId, answer.book, answer.editable);
  }
}
