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
