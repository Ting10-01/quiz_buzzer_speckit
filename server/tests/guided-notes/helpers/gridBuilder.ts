import { readFileSync } from 'node:fs';
import type { sheets_v4 } from '@googleapis/sheets';
import { SheetGrid } from '../../../src/guided-notes/SheetGrid.js';

// A cell value: a string, a number (stored as a Sheets number), or null/'' for an empty cell.
export type CellValue = string | number | null;

export interface SheetOptions {
  name?: string;
  sheetId?: number;
  index?: number;
}

function cellData(value: CellValue): sheets_v4.Schema$CellData {
  if (value === null || value === '') return {};
  if (typeof value === 'number') return { formattedValue: String(value), effectiveValue: { numberValue: value } };
  return { formattedValue: value, effectiveValue: { stringValue: value } };
}

function columnIndex(letters: string): number {
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col;
}

// "B5:B6" -> a GridRange (0-based, end exclusive), as spreadsheets.get returns merges.
function gridRange(a1Range: string, sheetId: number): sheets_v4.Schema$GridRange {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a1Range);
  if (!match) throw new Error(`bad range ${a1Range}`);
  const [, c1, r1, c2, r2] = match as unknown as [string, string, string, string, string];
  return {
    sheetId,
    startRowIndex: Number(r1) - 1,
    endRowIndex: Number(r2),
    startColumnIndex: columnIndex(c1) - 1,
    endColumnIndex: columnIndex(c2),
  };
}

// One `sheets[]` entry of a spreadsheets.get response. rows[0] is row 1, rows[0][0] is A1.
export function buildSheet(rows: CellValue[][], merges: string[] = [], options: SheetOptions = {}): sheets_v4.Schema$Sheet {
  const sheetId = options.sheetId ?? 0;
  return {
    properties: { sheetId, title: options.name ?? '學習單', index: options.index ?? 0 },
    merges: merges.map((m) => gridRange(m, sheetId)),
    data: [{ rowData: rows.map((row) => ({ values: row.map(cellData) })) }],
  };
}

export function buildGrid(rows: CellValue[][], merges: string[] = [], options: SheetOptions = {}): SheetGrid {
  return SheetGrid.fromApi(buildSheet(rows, merges, options));
}

// Rows as a sparse map: { 5: { B: 1, C: '題目' } } puts 1 in B5 and '題目' in C5.
export function rowsFrom(cells: Record<number, Record<string, CellValue>>): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const [row, columns] of Object.entries(cells)) {
    const r = Number(row) - 1;
    const line = (rows[r] ??= []);
    for (const [letters, value] of Object.entries(columns)) line[columnIndex(letters) - 1] = value;
  }
  return Array.from(rows, (row) => Array.from(row ?? [], (v) => v ?? null));
}

// A spreadsheets.get response stored in tests/guided-notes/fixtures/<name>.json.
export function loadFixture(name: string): sheets_v4.Schema$Spreadsheet {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')) as sheets_v4.Schema$Spreadsheet;
}

export function fixtureGrid(name: string, worksheet = '學習單'): SheetGrid {
  const sheet = loadFixture(name).sheets?.find((s) => s.properties?.title === worksheet);
  if (!sheet) throw new Error(`fixture ${name} has no worksheet ${worksheet}`);
  return SheetGrid.fromApi(sheet);
}
