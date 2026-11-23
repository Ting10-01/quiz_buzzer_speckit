import { describe, expect, it } from 'vitest';
import { GuidedNotesParser } from '../../src/guided-notes/GuidedNotesParser.js';
import type { ImportError, ImportSuccess, Spreadsheet } from '../../src/temp-shared/entities.js';
import { buildGrid, fixtureGrid, rowsFrom, type CellValue } from './helpers/gridBuilder.js';

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

function failure(result: ImportSuccess | ImportError): ImportError {
  if (!('code' in result)) throw new Error('expected an ImportError');
  return result;
}

// A sheet with the header on row 1 (A 題號, B 作答) and `numbers` from row 2 down.
function numbered(numbers: CellValue[], merges: string[] = []) {
  return buildGrid([['題號', '作答'], ...numbers.map((n) => [n])], merges, { name: '學習單' });
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

describe('GuidedNotesParser (question groups)', () => {
  it('parses the group template (AC-11, SC-001)', () => {
    const result = success(parser.parse(fixtureGrid('group'), SPREADSHEET));
    expect(result.headerRow).toBe(4);
    expect(result.headerColumns).toEqual(['B', 'C', 'G']);
    expect(result.questions.map((q) => [q.number, q.type])).toEqual([
      [1, 'GROUP'],
      [2, 'GROUP'],
      [3, 'SINGLE'],
      [4, 'SINGLE'],
    ]);
    expect(blanks(result)).toEqual(['G5', 'G6', 'G8', 'G9', 'G11', 'G13']);
  });

  it('keeps markers out of the SubQuestions (AC-12)', () => {
    const result = success(parser.parse(fixtureGrid('group'), SPREADSHEET));
    for (const sub of result.questions.flatMap((q) => q.subQuestions)) {
      expect(Object.keys(sub).sort()).toEqual(['blankCell', 'index']);
    }
  });

  it('returns one marker per blank cell (AC-12)', () => {
    const grid = fixtureGrid('group');
    const result = success(parser.parse(grid, SPREADSHEET));
    expect(parser.markersOf(grid, result)).toEqual({
      G5: '（1）',
      G6: '（2）',
      G8: '（1）',
      G9: '（2）',
      G11: '',
      G13: '',
    });
  });
});

describe('GuidedNotesParser.parse (errors)', () => {
  it('returns NO_HEADER with the current header texts (AC-17)', () => {
    const grid = buildGrid(rowsFrom({ 2: { B: '計算機概論基礎 學習單' }, 4: { B: 'No.', C: '內容', G: '學生填寫' }, 5: { B: 1 } }), [
      'B2:H2',
    ]);
    const error = failure(parser.parse(grid, SPREADSHEET));
    expect(error.code).toBe('NO_HEADER');
    expect(error.reason).toContain('「學習單」');
    expect(error.foundHeaders).toEqual(['No.', '內容', '學生填寫']);
    expect(error.acceptedHeaders).toEqual([
      '題號欄：題號、編號、題次',
      '作答欄：作答、答案、回答',
      '題目欄（可以沒有）：題目、問題、題幹',
    ]);
    expect(error.fixSteps.length).toBeGreaterThanOrEqual(1);
  });

  it('returns NO_QUESTIONS when no row below the header has a number (AC-20)', () => {
    const error = failure(parser.parse(numbered(['第一部分', null, '說明文字']), SPREADSHEET));
    expect(error.code).toBe('NO_QUESTIONS');
    expect(error.reason).toContain('第 1 列');
    expect(error.foundHeaders).toEqual([]);
  });

  it('returns INVALID_NUMBERING for a repeated number with both rows (AC-19)', () => {
    const error = failure(parser.parse(numbered([1, 2, 2]), SPREADSHEET));
    expect(error.code).toBe('INVALID_NUMBERING');
    expect(error.reason).toBe('第 4 列的題號 2 和第 3 列重複。');
  });

  it('returns INVALID_NUMBERING when 3 is above 2 (AC-19)', () => {
    const error = failure(parser.parse(numbered([1, 3, 2]), SPREADSHEET));
    expect(error.code).toBe('INVALID_NUMBERING');
    expect(error.reason).toContain('第 4 列的題號 2');
    expect(error.reason).toContain('第 3 列的題號 3');
  });

  it('accepts 200 questions and rejects 201 (AC-21)', () => {
    const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
    expect(success(parser.parse(numbered(numbers(200)), SPREADSHEET)).questions).toHaveLength(200);
    const error = failure(parser.parse(numbered(numbers(201)), SPREADSHEET));
    expect(error.code).toBe('TOO_MANY_QUESTIONS');
    expect(error.reason).toContain('201');
    expect(error.reason).toContain('200');
  });

  it('returns NO_BLANK when an answer cell is merged into the previous question (AC-22)', () => {
    const error = failure(parser.parse(numbered([1, 2, 3], ['B3:B4']), SPREADSHEET));
    expect(error.code).toBe('NO_BLANK');
    expect(error.reason).toContain('第 3 題');
    expect(error.reason).toContain('第 4 列');
  });
});
