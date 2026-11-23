import type { sheets_v4 } from '@googleapis/sheets';

// One `sheets[]` entry of a spreadsheets.get response.
export type ApiSheet = sheets_v4.Schema$Sheet;

// A merged range, 1-based and inclusive (the API's GridRange is 0-based, end exclusive).
export interface CellRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

// "A" for 1, "Z" for 26, "AA" for 27.
export function columnLetters(col: number): string {
  let letters = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

// Read-only view of one worksheet's cells and merges. Rows and columns are 1-based.
export class SheetGrid {
  private constructor(
    readonly sheetId: number,
    readonly name: string,
    readonly rowCount: number,
    readonly colCount: number,
    private readonly cells: (sheets_v4.Schema$CellData | undefined)[][],
    private readonly merges: CellRange[],
  ) {}

  static fromApi(sheet: ApiSheet): SheetGrid {
    const cells: (sheets_v4.Schema$CellData | undefined)[][] = [];
    let colCount = 0;
    for (const block of sheet.data ?? []) {
      const top = block.startRow ?? 0;
      const left = block.startColumn ?? 0;
      (block.rowData ?? []).forEach((rowData, r) => {
        const values = rowData.values ?? [];
        const row = (cells[top + r] ??= []);
        values.forEach((cell, c) => (row[left + c] = cell));
        if (values.length > 0) colCount = Math.max(colCount, left + values.length);
      });
    }
    const merges = (sheet.merges ?? []).map((m) => ({
      startRow: (m.startRowIndex ?? 0) + 1,
      endRow: m.endRowIndex ?? 0,
      startCol: (m.startColumnIndex ?? 0) + 1,
      endCol: m.endColumnIndex ?? 0,
    }));
    const rowCount = Math.max(cells.length, ...merges.map((m) => m.endRow));
    colCount = Math.max(colCount, ...merges.map((m) => m.endCol));
    return new SheetGrid(sheet.properties?.sheetId ?? 0, sheet.properties?.title ?? '', rowCount, colCount, cells, merges);
  }

  private cell(row: number, col: number): sheets_v4.Schema$CellData | undefined {
    return this.cells[row - 1]?.[col - 1];
  }

  // The displayed text (formattedValue); "" for an empty cell.
  text(row: number, col: number): string {
    return this.cell(row, col)?.formattedValue ?? '';
  }

  textA1(a1: string): string {
    const match = /^([A-Z]+)(\d+)$/.exec(a1);
    if (!match) return '';
    let col = 0;
    for (const ch of match[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
    return this.text(Number(match[2]), col);
  }

  // effectiveValue.numberValue, or null when the cell does not hold a number.
  number(row: number, col: number): number | null {
    return this.cell(row, col)?.effectiveValue?.numberValue ?? null;
  }

  // ponytail: linear scan over the merges; index them if sheets get large.
  mergeAt(row: number, col: number): CellRange | null {
    return (
      this.merges.find((m) => m.startRow <= row && row <= m.endRow && m.startCol <= col && col <= m.endCol) ?? null
    );
  }

  toA1(row: number, col: number): string {
    return `${columnLetters(col)}${row}`;
  }
}
