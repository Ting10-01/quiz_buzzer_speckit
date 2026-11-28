import type { FastifyBaseLogger } from 'fastify';
import { isGoogleAuthExpired, TeacherNotSignedInError } from '../auth/GoogleClientProvider.js';
import { httpStatusOf } from '../auth/GoogleOAuthGateway.js';
import { GuidedNotesParser } from '../guided-notes/GuidedNotesParser.js';
import type { BlankMarkers, ImportStore } from '../guided-notes/ImportStore.js';
import { isImportError } from '@quiz-buzzer/shared/guards';
import { SheetsReadError, type LoadedSpreadsheet, type SpreadsheetReader } from '../guided-notes/SpreadsheetReader.js';
import type { ActivityStore } from '../activity/index.js';
import type { ImportError, ImportSuccess, QuestionResult, WriteBackResult } from '@quiz-buzzer/shared/entities';
import { backupName, composeCellText } from './cellText.js';
import type { ResultQuery } from './ResultQuery.js';
import type { CellText, SpreadsheetWriter } from './SpreadsheetWriter.js';

export const WriteBackErrorCode = {
  NOT_FINISHED: 'NOT_FINISHED',
  IMPORT_CHANGED: 'IMPORT_CHANGED',
  LAYOUT_CHANGED: 'LAYOUT_CHANGED',
  NO_EDIT_PERMISSION: 'NO_EDIT_PERMISSION',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  GOOGLE_AUTH_EXPIRED: 'GOOGLE_AUTH_EXPIRED',
  GOOGLE_UNAVAILABLE: 'GOOGLE_UNAVAILABLE',
  BACKUP_FAILED: 'BACKUP_FAILED',
  WRITE_UNCONFIRMED: 'WRITE_UNCONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
} as const;
export type WriteBackErrorCode = (typeof WriteBackErrorCode)[keyof typeof WriteBackErrorCode];

// The spec's "寫回失敗原因" table, word for word.
const MESSAGES: Record<WriteBackErrorCode, (questionNumber?: number) => string> = {
  NOT_FINISHED: () => '活動還沒結束，結束最後一題後才能寫回。沒有寫入任何格子。',
  IMPORT_CHANGED: () => '目前匯入的學習單不是這次活動使用的學習單，無法寫回。沒有寫入任何格子。',
  LAYOUT_CHANGED: (n) =>
    `第 ${n} 題的位置和匯入時不同（例如插入或刪除了列），請把學習單改回匯入時的版面後再寫回。沒有寫入任何格子。`,
  NO_EDIT_PERMISSION: () => '沒有編輯權限，無法寫回。請改用可以編輯這份試算表的帳號。沒有寫入任何格子。',
  SHEET_NOT_FOUND: () =>
    '找不到學習單，或目前的帳號無法開啟它（試算表或工作表可能已被刪除或改名）。沒有寫入任何格子。',
  GOOGLE_AUTH_EXPIRED: () => 'Google 授權已失效，請回首頁重新登入後再寫回。沒有寫入任何格子。',
  GOOGLE_UNAVAILABLE: () => '連不上 Google，請稍後再寫回。沒有寫入任何格子。',
  BACKUP_FAILED: () => '無法建立備份工作表，所以沒有寫回。沒有寫入任何格子。',
  WRITE_UNCONFIRMED: () =>
    '寫入時與 Google 的連線中斷，無法確認是否已寫入。填空格不會只寫入一部分，請再寫回一次，結果與寫一次相同。',
  IN_PROGRESS: () => '寫回進行中，請等這次寫回完成。',
};

// An expected write-back failure. resultsRoutes answers it as 200 WriteBackResult(ok=false),
// or 401 ErrorBody for GOOGLE_AUTH_EXPIRED.
export class WriteBackFailure extends Error {
  // `questionNumber` only for LAYOUT_CHANGED.
  constructor(
    readonly code: WriteBackErrorCode,
    questionNumber?: number,
  ) {
    super(MESSAGES[code](questionNumber));
    this.name = 'WriteBackFailure';
  }
}

// Which Google call failed: the same error means something else in each (research RD-07).
export const WriteBackStep = {
  READ: 'READ',
  BACKUP: 'BACKUP',
  WRITE: 'WRITE',
} as const;
export type WriteBackStep = (typeof WriteBackStep)[keyof typeof WriteBackStep];

export interface WriteBackDeps {
  activities: Pick<ActivityStore, 'current'>;
  imports: Pick<ImportStore, 'latest' | 'latestMarkers'>;
  reader: SpreadsheetReader;
  query: ResultQuery;
  writer: SpreadsheetWriter;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  now?: () => Date;
}

// Writes the winning answers back into the Guided Notes: layout check, backup, then a single
// write (data-model section 4, sequence diagram part 3).
export class WriteBackService {
  // research RD-08: one write-back at a time (a single Node process).
  private inProgress = false;
  private readonly activities: Pick<ActivityStore, 'current'>;
  private readonly imports: Pick<ImportStore, 'latest' | 'latestMarkers'>;
  private readonly reader: SpreadsheetReader;
  private readonly parser = new GuidedNotesParser();
  private readonly query: ResultQuery;
  private readonly writer: SpreadsheetWriter;
  private readonly log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  private readonly now: () => Date;

  constructor(deps: WriteBackDeps) {
    this.activities = deps.activities;
    this.imports = deps.imports;
    this.reader = deps.reader;
    this.query = deps.query;
    this.writer = deps.writer;
    this.log = deps.log;
    this.now = deps.now ?? (() => new Date());
  }

  // Logs only the result code and cell count: never tokens or cell contents (constitution VI).
  async writeBack(): Promise<WriteBackResult> {
    try {
      const result = await this.runExclusively();
      this.log.info({ code: 'OK', cellCount: result.cellCount }, 'write back');
      return result;
    } catch (error) {
      if (error instanceof WriteBackFailure) this.log.warn({ code: error.code, cellCount: 0 }, 'write back failed');
      throw error;
    }
  }

  // The check and the flag are set before the first await, so a concurrent call sees it.
  private async runExclusively(): Promise<WriteBackResult> {
    if (this.inProgress) throw new WriteBackFailure('IN_PROGRESS');
    this.inProgress = true;
    try {
      return await this.run();
    } finally {
      this.inProgress = false;
    }
  }

  // Steps 2-8 of data-model section 4. Any failure leaves every blank cell untouched.
  private async run(): Promise<WriteBackResult> {
    const state = this.activities.current();
    if (!state || state.phase !== 'FINISHED') throw new WriteBackFailure('NOT_FINISHED');

    const stored = this.imports.latest();
    if (
      !stored ||
      stored.spreadsheet.id !== state.spreadsheet.id ||
      stored.spreadsheet.selectedWorksheet !== state.spreadsheet.selectedWorksheet
    ) {
      throw new WriteBackFailure('IMPORT_CHANGED');
    }
    const { id, selectedWorksheet } = stored.spreadsheet;
    const cells = this.planCells(stored, this.imports.latestMarkers(), this.query.allResults(null));
    if (cells.length === 0) return { ok: true, cellCount: 0 };

    let loaded: LoadedSpreadsheet;
    try {
      loaded = await this.reader.load(id);
    } catch (error) {
      throw this.mapGoogleError(error, 'READ');
    }
    const grid = loaded.sheets.find((s) => s.name === selectedWorksheet);
    if (!grid) throw new WriteBackFailure('SHEET_NOT_FOUND');
    if (!loaded.editable) throw new WriteBackFailure('NO_EDIT_PERMISSION');
    const mismatch = this.firstLayoutMismatch(stored, this.parser.parse(grid, stored.spreadsheet));
    if (mismatch !== null) throw new WriteBackFailure('LAYOUT_CHANGED', mismatch);

    const names = loaded.sheets.map((s) => s.name);
    try {
      await this.writer.duplicateSheet(id, grid.sheetId, backupName(selectedWorksheet, this.now(), names));
    } catch (error) {
      throw this.mapGoogleError(error, 'BACKUP');
    }
    try {
      await this.writer.writeTexts(id, selectedWorksheet, cells);
    } catch (error) {
      throw this.mapGoogleError(error, 'WRITE');
    }
    return { ok: true, cellCount: cells.length };
  }

  // research RD-07. An unclassified READ error is rethrown as is and becomes a 500.
  private mapGoogleError(error: unknown, step: WriteBackStep): WriteBackFailure {
    if (error instanceof TeacherNotSignedInError || isGoogleAuthExpired(error)) {
      return new WriteBackFailure('GOOGLE_AUTH_EXPIRED');
    }
    if (step === 'READ') {
      if (!(error instanceof SheetsReadError)) throw error;
      const byKind = { AUTH_EXPIRED: 'GOOGLE_AUTH_EXPIRED', NO_ACCESS: 'SHEET_NOT_FOUND', UNAVAILABLE: 'GOOGLE_UNAVAILABLE' } as const;
      return new WriteBackFailure(byKind[error.kind]);
    }
    const status = httpStatusOf(error);
    if (status === 403) return new WriteBackFailure('NO_EDIT_PERMISSION');
    if (status === 404) return new WriteBackFailure('SHEET_NOT_FOUND');
    // No HTTP answer: a timeout or a dropped connection. A write may or may not have been applied.
    if (status === undefined) return new WriteBackFailure(step === 'BACKUP' ? 'GOOGLE_UNAVAILABLE' : 'WRITE_UNCONFIRMED');
    // Google answered with a failure (e.g. 5xx), so nothing was applied.
    return new WriteBackFailure(step === 'BACKUP' ? 'BACKUP_FAILED' : 'GOOGLE_UNAVAILABLE');
  }

  // research RD-04: the first question whose number or blank cells differ from the import; an
  // ImportError (e.g. the header was changed) counts as question 1 of the import.
  private firstLayoutMismatch(stored: ImportSuccess, current: ImportSuccess | ImportError): number | null {
    if (isImportError(current)) return stored.questions[0]?.number ?? 1;
    const length = Math.max(stored.questions.length, current.questions.length);
    for (let i = 0; i < length; i++) {
      const before = stored.questions[i];
      const after = current.questions[i];
      const cellsOf = (q: typeof before) => q?.subQuestions.map((s) => s.blankCell).join(',');
      if (before?.number !== after?.number || cellsOf(before) !== cellsOf(after)) {
        return (before ?? after)!.number;
      }
    }
    return null;
  }

  // Every sub-question blank cell of every question with a winner: marker + answer when the marker is in
  // the blank cell, only the answer when it is in the cell on the left (REQ-RES-08, #34).
  private planCells(stored: ImportSuccess, markers: BlankMarkers | null, results: QuestionResult[]): CellText[] {
    return results.flatMap(({ questionNumber, winner }) => {
      const question = stored.questions.find((q) => q.number === questionNumber);
      if (!winner || !question) return [];
      return question.subQuestions.map(({ blankCell }, i) => {
        const found = markers?.[blankCell];
        return { cell: blankCell, text: composeCellText(found?.inBlankCell ? found.marker : '', winner.answers[i] ?? '') };
      });
    });
  }
}
