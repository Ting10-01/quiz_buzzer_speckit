import { describe, expect, it } from 'vitest';
import { SheetGrid } from '../../src/guided-notes/SheetGrid.js';
import { buildGrid, buildSheet, rowsFrom } from './helpers/gridBuilder.js';

const rows = rowsFrom({
  4: { B: '題號', C: '題目', G: '作答' },
  5: { B: 1, C: '第一題', G: '（1）' },
  6: { B: '１', G: '' },
  7: { B: 'abc' },
});

describe('SheetGrid', () => {
  it('reads name, sheet id and size from a spreadsheets.get sheet', () => {
    const grid = SheetGrid.fromApi(buildSheet(rows, ['B5:B6'], { name: '學習單', sheetId: 42 }));
    expect(grid.name).toBe('學習單');
    expect(grid.sheetId).toBe(42);
    expect(grid.rowCount).toBe(7);
    expect(grid.colCount).toBe(7);
  });

  it('counts merges that reach past the last value', () => {
    const grid = buildGrid([['x']], ['B2:H9']);
    expect(grid.rowCount).toBe(9);
    expect(grid.colCount).toBe(8);
  });

  it('converts GridRange merges to 1-based inclusive ranges', () => {
    const grid = buildGrid(rows, ['B5:B6', 'G4:H4']);
    const group = { startRow: 5, endRow: 6, startCol: 2, endCol: 2 };
    expect(grid.mergeAt(5, 2)).toEqual(group);
    expect(grid.mergeAt(6, 2)).toEqual(group);
    expect(grid.mergeAt(4, 8)).toEqual({ startRow: 4, endRow: 4, startCol: 7, endCol: 8 });
    expect(grid.mergeAt(7, 2)).toBeNull();
    expect(grid.mergeAt(4, 9)).toBeNull();
  });

  it('reads formattedValue as text and empty cells as ""', () => {
    const grid = buildGrid(rows);
    expect(grid.text(5, 3)).toBe('第一題');
    expect(grid.text(5, 2)).toBe('1');
    expect(grid.text(6, 7)).toBe('');
    expect(grid.text(100, 100)).toBe('');
  });

  it('reads numbers only from numeric cells', () => {
    const grid = buildGrid(rows);
    expect(grid.number(5, 2)).toBe(1);
    expect(grid.number(6, 2)).toBeNull(); // text "１", not a number value
    expect(grid.number(7, 2)).toBeNull();
    expect(grid.number(1, 1)).toBeNull();
  });

  it('converts between row/column and A1', () => {
    const grid = buildGrid(rows);
    expect(grid.toA1(5, 7)).toBe('G5');
    expect(grid.toA1(1, 26)).toBe('Z1');
    expect(grid.toA1(12, 27)).toBe('AA12');
    expect(grid.textA1('G5')).toBe('（1）');
    expect(grid.textA1('C5')).toBe(grid.text(5, 3));
  });
});
