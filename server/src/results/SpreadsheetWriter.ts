// One cell to write back. `cell` is the blankCell 003 found when importing (A1 such as "G5",
// without the worksheet name).
export interface CellText {
  cell: string;
  text: string;
}

// Changes a Google spreadsheet. The only production implementation is GoogleSheetsWriter; the
// interface exists so tests can substitute Google (constitution III, VIII).
export interface SpreadsheetWriter {
  // Copies the worksheet `sheetId` into a new worksheet named `newTitle` (the backup).
  duplicateSheet(spreadsheetId: string, sheetId: number, newTitle: string): Promise<void>;
  // Writes every cell as plain text in a single request.
  writeTexts(spreadsheetId: string, worksheet: string, cells: CellText[]): Promise<void>;
}
