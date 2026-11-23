import { describe, expect, it } from 'vitest';
import { GuidedNotesParser } from '../../src/guided-notes/GuidedNotesParser.js';
import type { ImportError, ImportSuccess, Spreadsheet } from '../../src/temp-shared/entities.js';
import { buildGrid, fixtureGrid, rowsFrom } from './helpers/gridBuilder.js';

const SPREADSHEET: Spreadsheet = {
  id: 'spreadsheet-id-0001',
  title: '計算機概論基礎 學習單',
  editable: true,
  worksheets: ['學習單'],
  selectedWorksheet: '學習單',
};

const parser = new GuidedNotesParser();

function success(result: ImportSuccess | ImportError): ImportSuccess {
  if ('code' in result) throw new Error(`unexpected ImportError ${result.code}: ${result.reason}`);
  return result;
}

function blanks(result: ImportSuccess): string[] {
  return result.questions.flatMap((q) => q.subQuestions.map((s) => s.blankCell));
}

describe('GuidedNotesParser.parse (success)', () => {
  it('parses the single template (AC-01)', () => {
    const result = success(parser.parse(fixtureGrid('single'), SPREADSHEET));
    expect(result.spreadsheet).toEqual(SPREADSHEET);
    expect(result.headerRow).toBe(4);
    expect(result.headerColumns).toEqual(['B', 'C', 'G']);
    expect(result.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.questions.every((q) => q.type === 'SINGLE' && q.subQuestions.length === 1)).toBe(true);
    expect(blanks(result)).toEqual(['G5', 'G7', 'G9', 'G11', 'G13', 'G15']);
    expect(result.questions[0]?.text).toMatch(/^電腦系統中負責執行程式指令/);
  });

  it('lists only the number and answer columns without a question column', () => {
    const grid = buildGrid(rowsFrom({ 3: { B: '題號', D: '作答' }, 4: { B: 1 }, 5: { B: 2 } }));
    const result = success(parser.parse(grid, SPREADSHEET));
    expect(result.headerRow).toBe(3);
    expect(result.headerColumns).toEqual(['B', 'D']);
    expect(result.questions.every((q) => q.text === undefined)).toBe(true);
  });

  it.each([
    ['variant-shifted', 7, ['D', 'E', 'I'], ['I8', 'I10', 'I12', 'I14', 'I16', 'I18']],
    ['variant-gaps', 6, ['B', 'C', 'G'], ['G7', 'G10', 'G13', 'G16', 'G19', 'G22']],
    ['variant-synonyms', 4, ['B', 'E', 'C'], ['C5', 'C6', 'C7', 'C8', 'C9', 'C10']],
  ])('parses %s without code changes (AC-03, SC-002)', (fixture, headerRow, headerColumns, cells) => {
    const result = success(parser.parse(fixtureGrid(fixture), SPREADSHEET));
    expect(result.headerRow).toBe(headerRow);
    expect(result.headerColumns).toEqual(headerColumns);
    expect(result.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(blanks(result)).toEqual(cells);
    expect(result.questions.every((q) => q.text !== undefined)).toBe(true);
  });

  it('keeps skipped numbers (AC-09)', () => {
    const grid = buildGrid(rowsFrom({ 1: { A: '題號', B: '作答' }, 2: { A: 1 }, 3: { A: 2 }, 4: { A: 4 } }));
    const result = success(parser.parse(grid, SPREADSHEET));
    expect(result.questions.map((q) => q.number)).toEqual([1, 2, 4]);
    expect(blanks(result)).toEqual(['B2', 'B3', 'B4']);
  });

  it('does not share the spreadsheet object with the caller', () => {
    const spreadsheet = { ...SPREADSHEET, worksheets: [...SPREADSHEET.worksheets] };
    const result = success(parser.parse(fixtureGrid('single'), spreadsheet));
    spreadsheet.worksheets.push('changed');
    expect(result.spreadsheet).toEqual(SPREADSHEET);
  });
});
