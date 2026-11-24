import { isUnexpectedError } from '@quiz-buzzer/shared/guards';

/** Text for the shared error area (FR-009): an UnexpectedError's message, otherwise the reason as is. */
export function errorMessage(reason: unknown): string {
  return isUnexpectedError(reason) ? reason.message : String(reason);
}
