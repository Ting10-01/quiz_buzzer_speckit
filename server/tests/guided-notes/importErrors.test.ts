import { describe, expect, it } from 'vitest';
import * as importErrors from '../../src/guided-notes/importErrors.js';
import type { ImportError } from '@quiz-buzzer/shared/entities';

const cases: [string, ImportError][] = [
  ['NO_HEADER', importErrors.noHeader('學習單', ['No.', '內容'])],
  ['NO_QUESTIONS', importErrors.noQuestions('學習單', 4)],
  ['INVALID_NUMBERING', importErrors.invalidNumbering(2, 9, { number: 2, row: 5 })],
  ['INVALID_NUMBERING', importErrors.invalidNumbering(2, 9, { number: 3, row: 7 })],
  ['TOO_MANY_QUESTIONS', importErrors.tooManyQuestions(201)],
  ['NO_BLANK', importErrors.noBlank(3, 11)],
  ['NO_ACCESS', importErrors.noAccess()],
  ['NO_WORKSHEET', importErrors.noWorksheet('學習單')],
];

describe('importErrors (SC-003)', () => {
  it.each(cases)('%s has a reason and at least one fix step', (code, error) => {
    expect(error.code).toBe(code);
    expect(error.reason.trim()).not.toBe('');
    expect(error.fixSteps.length).toBeGreaterThanOrEqual(1);
    for (const step of error.fixSteps) expect(step.trim()).not.toBe('');
  });

  it.each(cases.filter(([code]) => code !== 'NO_HEADER'))('%s has no header lists', (_code, error) => {
    expect(error.foundHeaders).toEqual([]);
    expect(error.acceptedHeaders).toEqual([]);
  });

  it('covers all seven codes', () => {
    expect(new Set(cases.map(([code]) => code))).toEqual(new Set(Object.values(importErrors.ImportErrorCode)));
  });

  it('fills both header lists only for NO_HEADER', () => {
    const error = importErrors.noHeader('學習單', ['No.', '內容']);
    expect(error.foundHeaders).toEqual(['No.', '內容']);
    expect(error.acceptedHeaders).toEqual([
      '題號欄：題號、編號、題次',
      '作答欄：作答、答案、回答',
      '題目欄（可以沒有）：題目、問題、題幹',
    ]);
  });

  it('points at the worksheet, row and number where it can', () => {
    expect(importErrors.noQuestions('學習單', 4).reason).toBe('「學習單」工作表的表頭（第 4 列）以下沒有任何題號。');
    expect(importErrors.invalidNumbering(2, 9, { number: 2, row: 5 }).reason).toBe('第 9 列的題號 2 和第 5 列重複。');
    expect(importErrors.invalidNumbering(2, 9, { number: 3, row: 7 }).reason).toBe(
      '第 9 列的題號 2 比上一題（第 7 列的題號 3）小，題號必須由上到下遞增。',
    );
    expect(importErrors.noBlank(3, 11).reason).toContain('第 3 題（第 11 列）');
    expect(importErrors.noWorksheet('第二份').reason).toContain('「第二份」');
  });
});
