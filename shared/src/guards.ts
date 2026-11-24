// Type guards used by pages to tell apart union return values of the service interfaces.
import type { ImportError, ImportSuccess, UnexpectedError, ValidationError } from './entities.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isValidationError(value: unknown): value is ValidationError {
  return isObject(value) && typeof value.field === 'string' && typeof value.message === 'string';
}

export function isImportError(value: unknown): value is ImportError {
  return (
    isObject(value) &&
    typeof value.code === 'string' &&
    typeof value.reason === 'string' &&
    Array.isArray(value.foundHeaders) &&
    Array.isArray(value.acceptedHeaders) &&
    Array.isArray(value.fixSteps)
  );
}

export function isImportSuccess(value: unknown): value is ImportSuccess {
  return (
    isObject(value) &&
    isObject(value.spreadsheet) &&
    typeof value.headerRow === 'number' &&
    Array.isArray(value.headerColumns) &&
    Array.isArray(value.questions)
  );
}

export function isUnexpectedError(value: unknown): value is UnexpectedError {
  return isObject(value) && typeof value.message === 'string' && !('field' in value);
}
