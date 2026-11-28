import type { CellText, SpreadsheetWriter } from '../../src/results/SpreadsheetWriter.js';

export type WriterCall =
  | { method: 'duplicateSheet'; spreadsheetId: string; sheetId: number; newTitle: string; insertIndex: number }
  | { method: 'writeTexts'; spreadsheetId: string; worksheet: string; cells: CellText[] };

// Shaped like the GaxiosError Google client libraries throw when Google answers `status`.
export function googleError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), { status, response: { status } });
}

// Shaped like a request that got no answer within its timeout: no HTTP status.
export function timeoutError(): Error {
  return Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ETIMEDOUT' });
}

// SpreadsheetWriter without Google: records every call in order; either method can be made to fail.
export class FakeSpreadsheetWriter implements SpreadsheetWriter {
  readonly calls: WriterCall[] = [];
  private readonly failures = new Map<WriterCall['method'], Error>();

  // Every later call of `method` is recorded, then rejects with `error`.
  fail(method: WriterCall['method'], error: Error): this {
    this.failures.set(method, error);
    return this;
  }

  async duplicateSheet(spreadsheetId: string, sheetId: number, newTitle: string, insertIndex: number): Promise<void> {
    this.calls.push({ method: 'duplicateSheet', spreadsheetId, sheetId, newTitle, insertIndex });
    this.throwIfFailing('duplicateSheet');
  }

  async writeTexts(spreadsheetId: string, worksheet: string, cells: CellText[]): Promise<void> {
    this.calls.push({ method: 'writeTexts', spreadsheetId, worksheet, cells: structuredClone(cells) });
    this.throwIfFailing('writeTexts');
  }

  callsOf<M extends WriterCall['method']>(method: M): Extract<WriterCall, { method: M }>[] {
    return this.calls.filter((c): c is Extract<WriterCall, { method: M }> => c.method === method);
  }

  private throwIfFailing(method: WriterCall['method']): void {
    const error = this.failures.get(method);
    if (error) throw error;
  }
}
