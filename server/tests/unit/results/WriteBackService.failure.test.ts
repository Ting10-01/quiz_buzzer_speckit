import type { sheets_v4 } from '@googleapis/sheets';
import { describe, expect, it, vi } from 'vitest';
import { TeacherNotSignedInError } from '../../../src/auth/GoogleClientProvider.js';
import { ImportStore } from '../../../src/guided-notes/ImportStore.js';
import { SheetsReadError } from '../../../src/guided-notes/SpreadsheetReader.js';
import { ResultQuery } from '../../../src/results/ResultQuery.js';
import { WriteBackFailure, WriteBackService, type WriteBackErrorCode } from '../../../src/results/WriteBackService.js';
import { FakeSpreadsheetWriter, googleError, timeoutError, type WriterCall } from '../../helpers/FakeSpreadsheetWriter.js';
import { FakeSpreadsheetReader } from '../../guided-notes/helpers/fakeSpreadsheetReader.js';
import { loadFixture } from '../../guided-notes/helpers/gridBuilder.js';
import { invalidGrantError } from '../../helpers/fakeGoogleGateway.js';
import {
  finishedActivityScenario,
  groupNotesImport,
  groupNotesReader,
  importedStore,
  midActivityScenario,
  SPREADSHEET_ID,
  type ResultScenario,
} from '../../results/helpers/resultFakes.js';

// The spec's "寫回失敗原因" table (SC-007, REQ-RES-14).
const REASONS: Record<Exclude<WriteBackErrorCode, 'LAYOUT_CHANGED'>, string> = {
  NOT_FINISHED: '活動還沒結束，結束最後一題後才能寫回。沒有寫入任何格子。',
  IMPORT_CHANGED: '目前匯入的學習單不是這次活動使用的學習單，無法寫回。沒有寫入任何格子。',
  NO_EDIT_PERMISSION: '沒有編輯權限，無法寫回。請改用可以編輯這份試算表的帳號。沒有寫入任何格子。',
  SHEET_NOT_FOUND: '找不到學習單，或目前的帳號無法開啟它（試算表或工作表可能已被刪除或改名）。沒有寫入任何格子。',
  GOOGLE_AUTH_EXPIRED: 'Google 授權已失效，請回首頁重新登入後再寫回。沒有寫入任何格子。',
  GOOGLE_UNAVAILABLE: '連不上 Google，請稍後再寫回。沒有寫入任何格子。',
  BACKUP_FAILED: '無法建立備份工作表，所以沒有寫回。沒有寫入任何格子。',
  WRITE_UNCONFIRMED:
    '寫入時與 Google 的連線中斷，無法確認是否已寫入。填空格不會只寫入一部分，請再寫回一次，結果與寫一次相同。',
  IN_PROGRESS: '寫回進行中，請等這次寫回完成。',
};

const layoutReason = (n: number) =>
  `第 ${n} 題的位置和匯入時不同（例如插入或刪除了列），請把學習單改回匯入時的版面後再寫回。沒有寫入任何格子。`;

interface Setup {
  scenario?: ResultScenario;
  imports?: ImportStore;
  reader?: FakeSpreadsheetReader;
}

function setup({ scenario = finishedActivityScenario(), imports = importedStore(), reader = groupNotesReader() }: Setup = {}) {
  const writer = new FakeSpreadsheetWriter();
  const log = { info: vi.fn(), warn: vi.fn() };
  const service = new WriteBackService({
    activities: scenario.activities,
    imports,
    reader,
    query: new ResultQuery(scenario.activities, scenario.submissions),
    writer,
    log,
  });
  return { service, reader, writer, log };
}

async function failureOf(service: WriteBackService): Promise<WriteBackFailure> {
  const error = await service.writeBack().then(
    () => new Error('write-back succeeded'),
    (e: unknown) => e,
  );
  if (error instanceof WriteBackFailure) return error;
  throw error;
}

const methods = (writer: FakeSpreadsheetWriter): WriterCall['method'][] => writer.calls.map((c) => c.method);

// The template as Google would return it after an edit.
function editedTemplate(edit: (sheet: sheets_v4.Schema$Sheet, rows: sheets_v4.Schema$RowData[]) => void) {
  const book = loadFixture('group');
  const sheet = book.sheets![0]!;
  edit(sheet, sheet.data![0]!.rowData!);
  return new FakeSpreadsheetReader().set(SPREADSHEET_ID, book);
}

// An empty row inserted above `row` (1-based); merges below move down with it.
function insertRowAbove(sheet: sheets_v4.Schema$Sheet, rows: sheets_v4.Schema$RowData[], row: number): void {
  rows.splice(row - 1, 0, {});
  for (const m of sheet.merges ?? []) {
    if ((m.startRowIndex ?? 0) >= row - 1) {
      m.startRowIndex! += 1;
      m.endRowIndex! += 1;
    }
  }
}

describe('before reading the spreadsheet', () => {
  it.each([
    ['the activity is still running', () => midActivityScenario()],
    ['there is no activity', () => ({ ...finishedActivityScenario(), activities: midActivityScenario().activities.set(null) })],
  ])('refuses with NOT_FINISHED when %s, without reading (AC-20, REQ-RES-16)', async (_name, scenario) => {
    const { service, reader, writer } = setup({ scenario: scenario() });
    const failure = await failureOf(service);
    expect(failure.code).toBe('NOT_FINISHED');
    expect(failure.message).toBe(REASONS.NOT_FINISHED);
    expect(reader.loadCalls).toEqual([]);
    expect(writer.calls).toEqual([]);
  });

  it.each([
    ['nothing is imported', () => new ImportStore()],
    ['another spreadsheet is imported', () => importedWith({ id: 'another-sheet-id-0002' })],
    ['another worksheet is imported', () => importedWith({ selectedWorksheet: '學習單 (2)' })],
  ])('refuses with IMPORT_CHANGED when %s (AC-29, REQ-RES-17)', async (_name, imports) => {
    const { service, reader, writer } = setup({ imports: imports() });
    const failure = await failureOf(service);
    expect(failure.code).toBe('IMPORT_CHANGED');
    expect(failure.message).toBe(REASONS.IMPORT_CHANGED);
    expect(reader.loadCalls).toEqual([]);
    expect(writer.calls).toEqual([]);
  });
});

function importedWith(spreadsheet: { id?: string; selectedWorksheet?: string }): ImportStore {
  const { result, markers } = groupNotesImport();
  const store = new ImportStore();
  store.save({ ...result, spreadsheet: { ...result.spreadsheet, ...spreadsheet } }, markers);
  return store;
}

describe('layout check (AC-21, REQ-RES-12)', () => {
  it.each([
    ['a row was inserted above question 3', 3, editedTemplate((sheet, rows) => insertRowAbove(sheet, rows, 10))],
    [
      'question 4 was renumbered',
      4,
      editedTemplate((_sheet, rows) => {
        rows[12]!.values![1] = { formattedValue: '5', effectiveValue: { numberValue: 5 } };
      }),
    ],
    ['the header row was cleared (ImportError)', 1, editedTemplate((_sheet, rows) => void (rows[3] = {}))],
  ])('refuses with LAYOUT_CHANGED when %s, without a backup', async (_name, question, reader) => {
    const { service, writer } = setup({ reader });
    const failure = await failureOf(service);
    expect(failure.code).toBe('LAYOUT_CHANGED');
    expect(failure.message).toBe(layoutReason(question));
    expect(writer.calls).toEqual([]);
  });

  it('ignores edits outside the question numbers and blank cells', async () => {
    const reader = editedTemplate((_sheet, rows) => {
      rows[1]!.values![1] = { formattedValue: '改過的標題' };
      rows[4]!.values![2] = { formattedValue: '改過的題目敘述' };
    });
    const { service } = setup({ reader });
    expect(await service.writeBack()).toEqual({ ok: true, cellCount: 5 });
  });

  it('refuses with SHEET_NOT_FOUND when the worksheet was renamed', async () => {
    const reader = editedTemplate((sheet) => void (sheet.properties!.title = '學習單（舊）'));
    const { service, writer } = setup({ reader });
    const failure = await failureOf(service);
    expect(failure.code).toBe('SHEET_NOT_FOUND');
    expect(failure.message).toBe(REASONS.SHEET_NOT_FOUND);
    expect(writer.calls).toEqual([]);
  });

  it('refuses with NO_EDIT_PERMISSION when the teacher cannot edit, without a backup (AC-22)', async () => {
    const reader = new FakeSpreadsheetReader().set(SPREADSHEET_ID, loadFixture('group'), false);
    const { service, writer } = setup({ reader });
    const failure = await failureOf(service);
    expect(failure.code).toBe('NO_EDIT_PERMISSION');
    expect(failure.message).toBe(REASONS.NO_EDIT_PERMISSION);
    expect(writer.calls).toEqual([]);
  });
});

// research RD-07 (AC-23 to AC-26).
describe('Google errors while reading', () => {
  it.each<[string, WriteBackErrorCode, Error]>([
    ['TeacherNotSignedInError', 'GOOGLE_AUTH_EXPIRED', new TeacherNotSignedInError()],
    ['Google 401', 'GOOGLE_AUTH_EXPIRED', googleError(401)],
    ['invalid_grant', 'GOOGLE_AUTH_EXPIRED', invalidGrantError()],
    ['SheetsReadError AUTH_EXPIRED', 'GOOGLE_AUTH_EXPIRED', new SheetsReadError('AUTH_EXPIRED')],
    ['SheetsReadError NO_ACCESS', 'SHEET_NOT_FOUND', new SheetsReadError('NO_ACCESS')],
    ['SheetsReadError UNAVAILABLE', 'GOOGLE_UNAVAILABLE', new SheetsReadError('UNAVAILABLE')],
  ])('%s -> %s, nothing backed up or written', async (_name, code, error) => {
    const { service, writer } = setup({ reader: new FakeSpreadsheetReader().fail(SPREADSHEET_ID, error) });
    const failure = await failureOf(service);
    expect(failure.code).toBe(code);
    expect(failure.message).toBe(REASONS[code as keyof typeof REASONS]);
    expect(writer.calls).toEqual([]);
  });

  it('rethrows any other error as unexpected (500)', async () => {
    const bug = googleError(400);
    const { service, writer } = setup({ reader: new FakeSpreadsheetReader().fail(SPREADSHEET_ID, bug) });
    await expect(service.writeBack()).rejects.toBe(bug);
    expect(writer.calls).toEqual([]);
  });
});

describe('Google errors while backing up (REQ-RES-13)', () => {
  it.each<[string, WriteBackErrorCode, Error]>([
    ['TeacherNotSignedInError', 'GOOGLE_AUTH_EXPIRED', new TeacherNotSignedInError()],
    ['401', 'GOOGLE_AUTH_EXPIRED', googleError(401)],
    ['403', 'NO_EDIT_PERMISSION', googleError(403)],
    ['404', 'SHEET_NOT_FOUND', googleError(404)],
    ['a timeout', 'GOOGLE_UNAVAILABLE', timeoutError()],
    ['500', 'BACKUP_FAILED', googleError(500)],
  ])('%s -> %s, and nothing is written', async (_name, code, error) => {
    const { service, writer } = setup();
    writer.fail('duplicateSheet', error);
    const failure = await failureOf(service);
    expect(failure.code).toBe(code);
    expect(failure.message).toBe(REASONS[code as keyof typeof REASONS]);
    expect(methods(writer)).toEqual(['duplicateSheet']);
  });
});

describe('Google errors while writing', () => {
  it.each<[string, WriteBackErrorCode, Error]>([
    ['TeacherNotSignedInError', 'GOOGLE_AUTH_EXPIRED', new TeacherNotSignedInError()],
    ['401', 'GOOGLE_AUTH_EXPIRED', googleError(401)],
    ['403', 'NO_EDIT_PERMISSION', googleError(403)],
    ['404', 'SHEET_NOT_FOUND', googleError(404)],
    ['a timeout', 'WRITE_UNCONFIRMED', timeoutError()],
    ['500', 'GOOGLE_UNAVAILABLE', googleError(500)],
  ])('%s -> %s', async (_name, code, error) => {
    const { service, writer } = setup();
    writer.fail('writeTexts', error);
    const failure = await failureOf(service);
    expect(failure.code).toBe(code);
    expect(failure.message).toBe(REASONS[code as keyof typeof REASONS]);
    expect(methods(writer)).toEqual(['duplicateSheet', 'writeTexts']);
  });
});

describe('one write-back at a time (AC-28, REQ-RES-18)', () => {
  it('refuses a second write-back while the first runs, without reading', async () => {
    const { service, reader, writer } = setup();
    const first = service.writeBack();
    const failure = await failureOf(service);
    expect(failure.code).toBe('IN_PROGRESS');
    expect(failure.message).toBe(REASONS.IN_PROGRESS);
    expect(await first).toEqual({ ok: true, cellCount: 5 });
    expect(reader.loadCalls).toHaveLength(1);
    expect(writer.callsOf('duplicateSheet')).toHaveLength(1);
  });

  it('allows a new write-back after a failure', async () => {
    const { service, writer } = setup();
    writer.fail('duplicateSheet', googleError(500));
    await failureOf(service);
    // Not IN_PROGRESS: the failed write-back no longer counts as running.
    expect((await failureOf(service)).code).toBe('BACKUP_FAILED');
    expect(writer.callsOf('duplicateSheet')).toHaveLength(2);
  });

  it('allows a new write-back after a successful one', async () => {
    const { service } = setup();
    await service.writeBack();
    expect(await service.writeBack()).toEqual({ ok: true, cellCount: 5 });
  });
});

describe('logging', () => {
  it('logs the result code and cell count, never tokens or cell contents', async () => {
    const ok = setup();
    await ok.service.writeBack();
    expect(ok.log.info).toHaveBeenCalledWith({ code: 'OK', cellCount: 5 }, 'write back');

    const failed = setup({ scenario: midActivityScenario() });
    await failureOf(failed.service);
    expect(failed.log.warn).toHaveBeenCalledWith({ code: 'NOT_FINISHED', cellCount: 0 }, 'write back failed');
  });
});
