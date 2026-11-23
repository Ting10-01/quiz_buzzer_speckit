import { drive } from '@googleapis/drive';
import { sheets, type sheets_v4 } from '@googleapis/sheets';
import type { GoogleClientProvider } from '../auth/GoogleClientProvider.js';
import { SheetGrid } from './SheetGrid.js';
import type { LoadedSpreadsheet, SpreadsheetReader } from './SpreadsheetReader.js';

// Title, worksheet order, cells and merges of every worksheet in one request (research R1).
const SPREADSHEET_FIELDS =
  'properties.title,sheets(properties(sheetId,title,index),merges,data(rowData(values(formattedValue,effectiveValue))))';

// The @googleapis packages bundle their own google-auth-library major version, so 002's
// OAuth2Client type differs from theirs although the object works the same at run time.
type ApiAuth = sheets_v4.Options['auth'];

export function toLoadedSpreadsheet(
  spreadsheetId: string,
  book: sheets_v4.Schema$Spreadsheet,
  canEdit: boolean | null | undefined,
): LoadedSpreadsheet {
  const ordered = [...(book.sheets ?? [])].sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  return {
    id: spreadsheetId,
    title: book.properties?.title ?? '',
    editable: canEdit === true,
    sheets: ordered.map((sheet) => SheetGrid.fromApi(sheet)),
  };
}

// Reads a spreadsheet with the signed-in teacher's Google authorization. Read-only (REQ-IMP-17).
export class GoogleSheetsReader implements SpreadsheetReader {
  constructor(private readonly clients: GoogleClientProvider) {}

  async load(spreadsheetId: string): Promise<LoadedSpreadsheet> {
    // Asked on every load, never kept: a new sign-in replaces the authorization (002 REQ-AUTH-03).
    const auth = this.clients.authorizedClient() as unknown as ApiAuth;
    const [book, file] = await Promise.all([
      sheets({ version: 'v4', auth }).spreadsheets.get({ spreadsheetId, includeGridData: true, fields: SPREADSHEET_FIELDS }),
      drive({ version: 'v3', auth }).files.get({ fileId: spreadsheetId, fields: 'capabilities/canEdit' }),
    ]);
    return toLoadedSpreadsheet(spreadsheetId, book.data, file.data.capabilities?.canEdit);
  }
}
