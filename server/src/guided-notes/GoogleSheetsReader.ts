import { drive } from '@googleapis/drive';
import { sheets, type sheets_v4 } from '@googleapis/sheets';
import { isGoogleAuthExpired, type GoogleClientProvider } from '../auth/GoogleClientProvider.js';
import { GoogleUnavailableError, httpStatusOf, isGoogleUnreachable } from '../auth/GoogleOAuthGateway.js';
import { SheetGrid } from './SheetGrid.js';
import { SheetsReadError, type LoadedSpreadsheet, type SpreadsheetReader } from './SpreadsheetReader.js';

// Title, worksheet order, cells and merges of every worksheet in one request (research R1).
const SPREADSHEET_FIELDS =
  'properties.title,sheets(properties(sheetId,title,index),merges,data(rowData(values(formattedValue,effectiveValue))))';

// Each load gives up after this long without an answer (SC-006).
export const GOOGLE_TIMEOUT_MS = 15_000;


// research R1. Other errors (e.g. 400) are rethrown and become 500 INTERNAL.
function toSheetsReadError(error: unknown): unknown {
  if (isGoogleAuthExpired(error)) return new SheetsReadError('AUTH_EXPIRED', { cause: error });
  const status = httpStatusOf(error);
  if (status === 403 || status === 404) return new SheetsReadError('NO_ACCESS', { cause: error });
  if (isGoogleUnreachable(error)) return new SheetsReadError('UNAVAILABLE', { cause: error });
  return error;
}

// Rejects with GoogleUnavailableError and aborts the requests when `work` takes too long.
async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GoogleUnavailableError('Google did not answer in time'));
    }, GOOGLE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

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
    const auth = this.clients.authorizedClient();
    try {
      const [book, file] = await withTimeout((signal) =>
        Promise.all([
          sheets({ version: 'v4', auth }).spreadsheets.get(
            { spreadsheetId, includeGridData: true, fields: SPREADSHEET_FIELDS },
            { signal },
          ),
          drive({ version: 'v3', auth }).files.get({ fileId: spreadsheetId, fields: 'capabilities/canEdit' }, { signal }),
        ]),
      );
      return toLoadedSpreadsheet(spreadsheetId, book.data, file.data.capabilities?.canEdit);
    } catch (error) {
      throw toSheetsReadError(error);
    }
  }
}
