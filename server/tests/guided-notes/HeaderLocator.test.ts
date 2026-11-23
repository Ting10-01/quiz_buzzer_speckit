import { describe, expect, it } from 'vitest';
import { HeaderLocator } from '../../src/guided-notes/HeaderLocator.js';
import { buildGrid, fixtureGrid, rowsFrom } from './helpers/gridBuilder.js';

describe('HeaderLocator.locate', () => {
  it('finds the header of the single template', () => {
    expect(HeaderLocator.locate(fixtureGrid('single'))).toEqual({ row: 4, numberCol: 2, answerCol: 7, questionCol: 3 });
  });

  it('takes the first row that has both a number and an answer header', () => {
    const grid = buildGrid(
      rowsFrom({
        1: { A: '題號', B: '說明' },
        2: { C: '作答' },
        3: { A: '題號', B: '作答' },
        6: { B: '編號', D: '答案' },
      }),
    );
    expect(HeaderLocator.locate(grid)).toEqual({ row: 3, numberCol: 1, answerCol: 2 });
  });

  it.each([
    ['題號', '作答', '題目'],
    ['編號', '答案', '問題'],
    ['題次', '回答', '題幹'],
  ])('accepts the synonyms %s / %s / %s (AC-08)', (number, answer, question) => {
    const grid = buildGrid(rowsFrom({ 2: { B: number, C: question, E: answer } }));
    expect(HeaderLocator.locate(grid)).toEqual({ row: 2, numberCol: 2, answerCol: 5, questionCol: 3 });
  });

  it('ignores surrounding half-width and full-width spaces', () => {
    const grid = buildGrid(rowsFrom({ 1: { A: '  題號　', B: '　作答 ' } }));
    expect(HeaderLocator.locate(grid)).toEqual({ row: 1, numberCol: 1, answerCol: 2 });
  });

  it('requires the whole text to match', () => {
    const grid = buildGrid(rowsFrom({ 1: { A: '題號', B: '學生作答', C: '答案說明', D: '題目內容' } }));
    expect(HeaderLocator.locate(grid)).toBeNull();
  });

  it('uses the leftmost column of a merged header cell', () => {
    const grid = buildGrid(rowsFrom({ 4: { B: '題號', G: '作答' } }), ['G4:H4']);
    expect(HeaderLocator.locate(grid)?.answerCol).toBe(7);
  });

  it('allows a sheet without a question column (AC-04)', () => {
    const grid = buildGrid(rowsFrom({ 1: { A: '題號', B: '作答' } }));
    expect(HeaderLocator.locate(grid)).toEqual({ row: 1, numberCol: 1, answerCol: 2 });
    expect(HeaderLocator.locate(grid)).not.toHaveProperty('questionCol');
  });

  it('returns null without a header row', () => {
    expect(HeaderLocator.locate(buildGrid(rowsFrom({ 4: { B: 'No.', C: '內容', G: '學生填寫' } })))).toBeNull();
    expect(HeaderLocator.locate(buildGrid([]))).toBeNull();
  });

  it('exposes the accepted header texts', () => {
    expect(HeaderLocator.NUMBER_HEADERS).toEqual(['題號', '編號', '題次']);
    expect(HeaderLocator.ANSWER_HEADERS).toEqual(['作答', '答案', '回答']);
    expect(HeaderLocator.QUESTION_HEADERS).toEqual(['題目', '問題', '題幹']);
  });
});

describe('HeaderLocator.currentHeaderTexts', () => {
  it('skips a title row with a single cell and lists the next row left to right', () => {
    const grid = buildGrid(
      rowsFrom({ 2: { B: '計算機概論基礎 學習單' }, 4: { B: 'No.', C: '內容', G: ' 學生填寫 ' } }),
      ['B2:H2'],
    );
    expect(HeaderLocator.currentHeaderTexts(grid)).toEqual(['No.', '內容', '學生填寫']);
  });

  it('returns an empty list when no row has two non-blank cells', () => {
    expect(HeaderLocator.currentHeaderTexts(buildGrid(rowsFrom({ 1: { A: '說明' }, 2: { B: '  ' } })))).toEqual([]);
  });
});
