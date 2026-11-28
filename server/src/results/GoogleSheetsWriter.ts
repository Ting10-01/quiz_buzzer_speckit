import { sheets } from '@googleapis/sheets';
import type { GoogleClientProvider } from '../auth/GoogleClientProvider.js';
import { GOOGLE_TIMEOUT_MS } from '../guided-notes/GoogleSheetsReader.js';
import type { CellText, SpreadsheetWriter } from './SpreadsheetWriter.js';

// "'<worksheet>'!<cell>", with every ' in the name doubled.
function rangeOf(worksheet: string, cell: string): string {
  return `'${worksheet.replaceAll("'", "''")}'!${cell}`;
}

// The only place 006 changes a Google spreadsheet. Errors are thrown as they come;
// WriteBackService.mapGoogleError decides what they mean (research RD-07).
export class GoogleSheetsWriter implements SpreadsheetWriter {
  private readonly timeoutMs = GOOGLE_TIMEOUT_MS;

  constructor(private readonly clients: GoogleClientProvider) {}

  // Without insertSheetIndex Google puts the copy first, and 003 would then pick it on the next import (#33).
  async duplicateSheet(spreadsheetId: string, sheetId: number, newTitle: string, insertIndex: number): Promise<void> {
    const duplicateSheet = { sourceSheetId: sheetId, newSheetName: newTitle, insertSheetIndex: insertIndex };
    await this.api().spreadsheets.batchUpdate(
      { spreadsheetId, requestBody: { requests: [{ duplicateSheet }] } },
      { timeout: this.timeoutMs },
    );
  }

  // One request, applied by Google as a whole; RAW keeps "=1+1" as text (research RD-06).
  async writeTexts(spreadsheetId: string, worksheet: string, cells: CellText[]): Promise<void> {
    await this.api().spreadsheets.values.batchUpdate(
      {
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: cells.map(({ cell, text }) => ({ range: rangeOf(worksheet, cell), values: [[text]] })),
        },
      },
      { timeout: this.timeoutMs },
    );
  }

  // Asked on every call, never kept: a new sign-in replaces the authorization (002 REQ-AUTH-03).
  private api() {
    return sheets({ version: 'v4', auth: this.clients.authorizedClient() });
  }
}
