import type { FastifyBaseLogger } from 'fastify';
import { GuidedNotesParser } from '../guided-notes/GuidedNotesParser.js';
import type { BlankMarkers, ImportStore } from '../guided-notes/ImportStore.js';
import { isImportError } from '../guided-notes/importErrors.js';
import type { SpreadsheetReader } from '../guided-notes/SpreadsheetReader.js';
import type { ActivityStore } from '../temp-deps/activity.js';
import type { ImportError, ImportSuccess, QuestionResult, WriteBackResult } from '../temp-shared/entities.js';
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

export interface WriteBackDeps {
  activities: ActivityStore;
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
  private readonly activities: ActivityStore;
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

  async writeBack(): Promise<WriteBackResult> {
    const stored = this.imports.latest()!;
    const { id, selectedWorksheet } = stored.spreadsheet;
    const cells = this.planCells(stored, this.imports.latestMarkers(), this.query.allResults(null));
    if (cells.length === 0) return { ok: true, cellCount: 0 };

    const loaded = await this.reader.load(id);
    const grid = loaded.sheets.find((s) => s.name === selectedWorksheet)!;
    const mismatch = this.firstLayoutMismatch(stored, this.parser.parse(grid, stored.spreadsheet));
    if (mismatch !== null) throw new WriteBackFailure('LAYOUT_CHANGED', mismatch);

    const names = loaded.sheets.map((s) => s.name);
    await this.writer.duplicateSheet(id, grid.sheetId, backupName(selectedWorksheet, this.now(), names));
    await this.writer.writeTexts(id, selectedWorksheet, cells);
    return { ok: true, cellCount: cells.length };
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

  // Every sub-question blank cell of every question with a winner, as marker + answer.
  private planCells(stored: ImportSuccess, markers: BlankMarkers | null, results: QuestionResult[]): CellText[] {
    return results.flatMap(({ questionNumber, winner }) => {
      const question = stored.questions.find((q) => q.number === questionNumber);
      if (!winner || !question) return [];
      return question.subQuestions.map(({ blankCell }, i) => ({
        cell: blankCell,
        text: composeCellText(markers?.[blankCell] ?? '', winner.answers[i] ?? ''),
      }));
    });
  }
}
