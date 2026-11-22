import { describe, expect, it } from 'vitest';
import {
  isImportError,
  isImportSuccess,
  isUnexpectedError,
  isValidationError,
} from '@quiz-buzzer/shared/guards';

const validationError = { field: 'groupCount', message: 'bad' };
const importError = {
  code: 'NO_HEADER',
  reason: 'no header',
  foundHeaders: [],
  acceptedHeaders: [],
  fixSteps: [],
};
const importSuccess = {
  spreadsheet: { id: 'a', title: 'A', editable: true, worksheets: ['s'], selectedWorksheet: 's' },
  headerRow: 4,
  headerColumns: ['B'],
  questions: [],
};
const unexpectedError = { message: 'down' };

describe('guards', () => {
  it('isValidationError', () => {
    expect(isValidationError(validationError)).toBe(true);
    expect(isValidationError(unexpectedError)).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });

  it('isImportError', () => {
    expect(isImportError(importError)).toBe(true);
    expect(isImportError(importSuccess)).toBe(false);
  });

  it('isImportSuccess', () => {
    expect(isImportSuccess(importSuccess)).toBe(true);
    expect(isImportSuccess(importError)).toBe(false);
  });

  it('isUnexpectedError', () => {
    expect(isUnexpectedError(unexpectedError)).toBe(true);
    expect(isUnexpectedError(validationError)).toBe(false);
    expect(isUnexpectedError('down')).toBe(false);
  });
});
