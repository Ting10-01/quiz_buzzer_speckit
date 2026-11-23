import { describe, expect, it } from 'vitest';
import type { HeaderMatch } from '../../src/guided-notes/HeaderLocator.js';
import { QuestionScanner, type ScannedQuestion } from '../../src/guided-notes/QuestionScanner.js';
import type { ImportError } from '../../src/temp-shared/entities.js';
import { buildGrid, fixtureGrid, rowsFrom, type CellValue } from './helpers/gridBuilder.js';

const HEADER: HeaderMatch = { row: 1, numberCol: 2, answerCol: 7, questionCol: 3 };
const scanner = new QuestionScanner();

function scan(cells: Record<number, Record<string, CellValue>>, merges: string[] = [], header = HEADER) {
  return scanner.scan(buildGrid(rowsFrom({ 1: { B: '題號', C: '題目', G: '作答' }, ...cells }), merges), header);
}

function scanned(cells: Record<number, Record<string, CellValue>>, merges: string[] = [], header = HEADER): ScannedQuestion[] {
  const result = scan(cells, merges, header);
  if (!Array.isArray(result)) throw new Error(`unexpected ImportError ${(result as ImportError).code}`);
  return result;
}

describe('QuestionScanner.scan (single questions)', () => {
  it('reads the single template', () => {
    const result = scanner.scan(fixtureGrid('single'), { row: 4, numberCol: 2, answerCol: 7, questionCol: 3 });
    expect(Array.isArray(result)).toBe(true);
    const questions = result as ScannedQuestion[];
    expect(questions.map((q) => [q.row, q.question.number, q.question.subQuestions[0]?.blankCell])).toEqual([
      [5, 1, 'G5'],
      [7, 2, 'G7'],
      [9, 3, 'G9'],
      [11, 4, 'G11'],
      [13, 5, 'G13'],
      [15, 6, 'G15'],
    ]);
  });

  it.each<[string, CellValue]>([
    ['the number 1', 1],
    ['the number 1.0', 1.0],
    ['the text "1"', '1'],
    ['the full-width text "１"', '１'],
    ['the text " 1 "', ' 1 '],
  ])('accepts %s as question number 1', (_name, value) => {
    expect(scanned({ 2: { B: value } }).map((q) => q.question.number)).toEqual([1]);
  });

  it.each<[string, CellValue]>([
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ['the text "1.5"', '1.5'],
    ['a section title', '第一部分'],
    ['an empty cell', null],
  ])('skips a row whose number cell is %s', (_name, value) => {
    expect(scanned({ 2: { B: value }, 3: { B: 2 } }).map((q) => q.question.number)).toEqual([2]);
  });

  it('uses the top-left cell of a merged answer cell', () => {
    const [q] = scanned({ 5: { B: 1 } }, ['G5:H5']);
    expect(q?.question.subQuestions).toEqual([{ index: 1, blankCell: 'G5' }]);
  });

  it('makes a single question with exactly one sub-question', () => {
    expect(scanned({ 2: { B: 1, C: '題目一' } })).toEqual([
      { row: 2, question: { number: 1, type: 'SINGLE', text: '題目一', subQuestions: [{ index: 1, blankCell: 'G2' }] } },
    ]);
  });

  it('reads the question text from the question column, merged or not, trimmed (AC-04)', () => {
    const [a, b] = scanned({ 2: { B: 1, C: '  題目一 ' }, 3: { B: 2, C: '題目二' } }, ['C3:F3']);
    expect(a?.question.text).toBe('題目一');
    expect(b?.question.text).toBe('題目二');
  });

  it('leaves out text when the question cell is blank', () => {
    const [q] = scanned({ 2: { B: 1, C: '   ' } });
    expect(q?.question).not.toHaveProperty('text');
  });

  it('leaves out text without a question column (AC-04)', () => {
    const [q] = scanned({ 2: { B: 1, C: '不是題目欄' } }, [], { row: 1, numberCol: 2, answerCol: 7 });
    expect(q?.question).toEqual({ number: 1, type: 'SINGLE', subQuestions: [{ index: 1, blankCell: 'G2' }] });
  });
});

describe('QuestionScanner.scan (question groups)', () => {
  it('makes a GROUP with one sub-question per row of a 2-row number merge (AC-11)', () => {
    const [q] = scanned({ 5: { B: 1, G: '（1）' }, 6: { G: '（2）' }, 7: { B: 2 } }, ['B5:B6']);
    expect(q?.row).toBe(5);
    expect(q?.question.type).toBe('GROUP');
    expect(q?.question.subQuestions).toEqual([
      { index: 1, blankCell: 'G5' },
      { index: 2, blankCell: 'G6' },
    ]);
  });

  it('makes 3 sub-questions for a 3-row number merge (AC-13)', () => {
    const result = scanned({ 5: { B: 1 }, 8: { B: 2 } }, ['B5:B7']);
    expect(result.map((q) => q.question.number)).toEqual([1, 2]);
    expect(result[0]?.question.subQuestions.map((s) => s.blankCell)).toEqual(['G5', 'G6', 'G7']);
    expect(result[1]?.question.type).toBe('SINGLE');
  });

  it('keeps a question SINGLE even with a marker in its blank cell (AC-14)', () => {
    const [q] = scanned({ 5: { B: 1, G: '（1）' } });
    expect(q?.question.type).toBe('SINGLE');
    expect(q?.question.subQuestions).toEqual([{ index: 1, blankCell: 'G5' }]);
  });

  it('does not count a row whose answer cell is merged into the row above', () => {
    const [q] = scanned({ 5: { B: 1 } }, ['B5:B7', 'G6:H7']);
    expect(q?.question.subQuestions).toEqual([
      { index: 1, blankCell: 'G5' },
      { index: 2, blankCell: 'G6' },
    ]);
  });

  it('writes each sub-question line as marker + question text (AC-15)', () => {
    const [q] = scanned(
      {
        5: { B: 1, C: '第一小題', G: '（1）' },
        6: { C: '第二小題', G: '(2) 舊答案' },
        7: { C: '第三小題', G: '' },
        8: { C: '   ', G: '（4）' },
      },
      ['B5:B8'],
    );
    expect(q?.question.text).toBe('（1）第一小題\n(2)第二小題\n（3）第三小題');
  });

  it('leaves out text when no row of the group has question text', () => {
    const [q] = scanned({ 5: { B: 1, G: '（1）' }, 6: { G: '（2）' } }, ['B5:B6']);
    expect(q?.question).not.toHaveProperty('text');
  });

  it('reads the group template', () => {
    const result = scanner.scan(fixtureGrid('group'), { row: 4, numberCol: 2, answerCol: 7, questionCol: 3 });
    const questions = (result as ScannedQuestion[]).map((q) => q.question);
    expect(questions.map((q) => [q.number, q.type, q.subQuestions.map((s) => s.blankCell)])).toEqual([
      [1, 'GROUP', ['G5', 'G6']],
      [2, 'GROUP', ['G8', 'G9']],
      [3, 'SINGLE', ['G11']],
      [4, 'SINGLE', ['G13']],
    ]);
    expect(questions[0]?.text?.split('\n')).toHaveLength(2);
    expect(questions[0]?.text).toMatch(/^（1）根據文章第一段.*\n（2）而他安裝的 Windows/);
  });
});

describe('QuestionScanner.extractMarker (AC-12)', () => {
  it.each([
    ['（1）', '（1）'],
    ['(1)', '(1)'],
    ['（1)', '（1)'],
    ['  （ 2 ）', '（ 2 ）'],
    ['（2）堆疊', '（2）'],
    ['', ''],
    ['___', ''],
    ['答案（1）', ''],
    ['（a）', ''],
  ])('reads %j as %j', (text, marker) => {
    expect(QuestionScanner.extractMarker(text)).toBe(marker);
  });
});
