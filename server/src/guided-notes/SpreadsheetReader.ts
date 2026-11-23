import type { SheetGrid } from './SheetGrid.js';

// One spreadsheet: every worksheet (cells and merges, in sheet order) and whether the
// current teacher can edit it.
export interface LoadedSpreadsheet {
  id: string;
  title: string;
  editable: boolean;
  sheets: SheetGrid[];
}

// Read-only access to a Google spreadsheet. The only production implementation is
// GoogleSheetsReader; the interface exists so tests can substitute Google (constitution III, VIII).
// 006 also uses it (as `app.spreadsheetReader`) for the layout check before writing back.
export interface SpreadsheetReader {
  load(spreadsheetId: string): Promise<LoadedSpreadsheet>;
}

export type SheetsReadErrorKind = 'NO_ACCESS' | 'UNAVAILABLE' | 'AUTH_EXPIRED';

// NO_ACCESS: Google answered 403 or 404. UNAVAILABLE: timeout, network error or 5xx.
// AUTH_EXPIRED: 002's isGoogleAuthExpired(error) is true.
export class SheetsReadError extends Error {
  constructor(
    readonly kind: SheetsReadErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`Cannot read the spreadsheet: ${kind}`, options);
    this.name = 'SheetsReadError';
  }
}
