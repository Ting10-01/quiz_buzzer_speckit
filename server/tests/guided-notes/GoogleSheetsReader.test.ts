import { drive } from '@googleapis/drive';
import { sheets } from '@googleapis/sheets';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleClientProvider, TeacherNotSignedInError } from '../../src/auth/GoogleClientProvider.js';
import { GoogleSheetsReader } from '../../src/guided-notes/GoogleSheetsReader.js';
import { SheetsReadError } from '../../src/guided-notes/SpreadsheetReader.js';
import { FakeGoogleGateway, invalidGrantError, signInFor } from '../helpers/fakeGoogleGateway.js';
import { loadFixture } from './helpers/gridBuilder.js';

// Every method of the two clients that could change a file; none may be called (REQ-IMP-17).
const api = vi.hoisted(() => ({
  sheetsGet: vi.fn(),
  filesGet: vi.fn(),
  writes: {
    batchUpdate: vi.fn(),
    create: vi.fn(),
    valuesUpdate: vi.fn(),
    valuesBatchUpdate: vi.fn(),
    valuesAppend: vi.fn(),
    valuesClear: vi.fn(),
    sheetsCopyTo: vi.fn(),
    filesUpdate: vi.fn(),
    filesCreate: vi.fn(),
    filesDelete: vi.fn(),
    filesCopy: vi.fn(),
  },
}));

vi.mock('@googleapis/sheets', () => ({
  sheets: vi.fn(() => ({
    spreadsheets: {
      get: api.sheetsGet,
      batchUpdate: api.writes.batchUpdate,
      create: api.writes.create,
      values: {
        update: api.writes.valuesUpdate,
        batchUpdate: api.writes.valuesBatchUpdate,
        append: api.writes.valuesAppend,
        clear: api.writes.valuesClear,
      },
      sheets: { copyTo: api.writes.sheetsCopyTo },
    },
  })),
}));

vi.mock('@googleapis/drive', () => ({
  drive: vi.fn(() => ({
    files: {
      get: api.filesGet,
      update: api.writes.filesUpdate,
      create: api.writes.filesCreate,
      delete: api.writes.filesDelete,
      copy: api.writes.filesCopy,
    },
  })),
}));

const FIELDS =
  'properties.title,sheets(properties(sheetId,title,index),merges,data(rowData(values(formattedValue,effectiveValue))))';
const ID = 'spreadsheet-id-0001';

let gateway: FakeGoogleGateway;
let clients: GoogleClientProvider;
let reader: GoogleSheetsReader;

// canEdit null: Drive's answer has no capabilities at all.
function answer(book: unknown, canEdit: boolean | null = true): void {
  api.sheetsGet.mockResolvedValue({ data: book });
  api.filesGet.mockResolvedValue({ data: canEdit === null ? {} : { capabilities: { canEdit } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateway = new FakeGoogleGateway();
  clients = new GoogleClientProvider(gateway);
  clients.replace(signInFor('teacher.a@example.com').tokens);
  reader = new GoogleSheetsReader(clients);
});

describe('GoogleSheetsReader.load', () => {
  it('reads cells and merges of every worksheet with one spreadsheets.get', async () => {
    answer(loadFixture('single'));
    await reader.load(ID);
    expect(api.sheetsGet).toHaveBeenCalledTimes(1);
    expect(api.sheetsGet.mock.calls[0]?.[0]).toEqual({ spreadsheetId: ID, includeGridData: true, fields: FIELDS });
  });

  it('asks Drive only for capabilities/canEdit', async () => {
    answer(loadFixture('single'));
    await reader.load(ID);
    expect(api.filesGet).toHaveBeenCalledTimes(1);
    expect(api.filesGet.mock.calls[0]?.[0]).toEqual({ fileId: ID, fields: 'capabilities/canEdit' });
  });

  it('returns id, title, editable and the worksheets', async () => {
    answer(loadFixture('single'));
    const book = await reader.load(ID);
    expect(book.id).toBe(ID);
    expect(book.title).toBe('計算機概論基礎 學習單');
    expect(book.editable).toBe(true);
    expect(book.sheets.map((s) => s.name)).toEqual(['學習單']);
    expect(book.sheets[0]?.textA1('B4')).toBe('題號');
  });

  it.each([
    [false, false],
    [null, false],
  ])('reports editable=false when canEdit is %s (AC-07)', async (canEdit, editable) => {
    answer(loadFixture('single'), canEdit);
    expect((await reader.load(ID)).editable).toBe(editable);
  });

  it('orders the worksheets by their index', async () => {
    const book = loadFixture('multi-sheet');
    book.sheets = [...(book.sheets ?? [])].reverse();
    answer(book);
    expect((await reader.load(ID)).sheets.map((s) => s.name)).toEqual(['說明', '學習單']);
  });

  it('passes the current authorized client to both APIs', async () => {
    answer(loadFixture('single'));
    await reader.load(ID);
    expect(sheets).toHaveBeenCalledWith(expect.objectContaining({ version: 'v4', auth: gateway.lastClient }));
    expect(drive).toHaveBeenCalledWith(expect.objectContaining({ version: 'v3', auth: gateway.lastClient }));
  });

  it('asks for the authorized client on every load, so a new sign-in is used', async () => {
    answer(loadFixture('single'));
    await reader.load(ID);
    clients.replace(signInFor('teacher.b@example.com').tokens);
    await reader.load(ID);
    expect(vi.mocked(sheets).mock.calls[1]?.[0]).toEqual(expect.objectContaining({ auth: gateway.lastClient }));
    expect(vi.mocked(drive).mock.calls[1]?.[0]).toEqual(expect.objectContaining({ auth: gateway.lastClient }));
  });

  it('only reads: no method that changes a file is called (AC-10)', async () => {
    answer(loadFixture('multi-sheet'));
    await reader.load(ID);
    expect(api.sheetsGet).toHaveBeenCalledTimes(1);
    expect(api.filesGet).toHaveBeenCalledTimes(1);
    for (const write of Object.values(api.writes)) expect(write).not.toHaveBeenCalled();
  });
});

// Shaped like the GaxiosError the @googleapis clients throw when Google answers with `status`.
function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), { status, response: { status } });
}

// Shaped like a GaxiosError without an answer (DNS failure, connection reset).
function networkError(): Error {
  return Object.assign(new Error('getaddrinfo ENOTFOUND sheets.googleapis.com'), { code: 'ENOTFOUND' });
}

async function readError(): Promise<unknown> {
  return reader.load(ID).then(
    () => {
      throw new Error('load() resolved');
    },
    (error: unknown) => error,
  );
}

describe('GoogleSheetsReader.load errors', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['403 from Sheets', 'sheets', 403],
    ['404 from Sheets', 'sheets', 404],
    ['403 from Drive', 'drive', 403],
    ['404 from Drive', 'drive', 404],
  ])('maps %s to NO_ACCESS', async (_name, api_, status) => {
    answer(loadFixture('single'));
    (api_ === 'sheets' ? api.sheetsGet : api.filesGet).mockRejectedValue(httpError(status));
    const error = await readError();
    expect(error).toBeInstanceOf(SheetsReadError);
    expect((error as SheetsReadError).kind).toBe('NO_ACCESS');
  });

  it.each([
    ['500', () => httpError(500)],
    ['503', () => httpError(503)],
    ['a network error', networkError],
  ])('maps %s to UNAVAILABLE', async (_name, makeError) => {
    answer(loadFixture('single'));
    api.sheetsGet.mockRejectedValue(makeError());
    const error = await readError();
    expect(error).toBeInstanceOf(SheetsReadError);
    expect((error as SheetsReadError).kind).toBe('UNAVAILABLE');
  });

  it('gives up with UNAVAILABLE after 15 seconds without an answer (SC-006)', async () => {
    vi.useFakeTimers();
    api.sheetsGet.mockReturnValue(new Promise(() => {}));
    api.filesGet.mockResolvedValue({ data: { capabilities: { canEdit: true } } });
    const settled = vi.fn();
    const result = readError().then((error) => {
      settled();
      return error;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const error = await result;
    expect(error).toBeInstanceOf(SheetsReadError);
    expect((error as SheetsReadError).kind).toBe('UNAVAILABLE');
  });

  it('aborts the requests when it gives up', async () => {
    vi.useFakeTimers();
    api.sheetsGet.mockReturnValue(new Promise(() => {}));
    api.filesGet.mockReturnValue(new Promise(() => {}));
    const result = readError();
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    const signal = (api.sheetsGet.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined)?.signal;
    expect(signal?.aborted).toBe(true);
    expect((api.filesGet.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined)?.signal?.aborted).toBe(true);
  });

  it.each([
    ['401', () => httpError(401)],
    ['invalid_grant', invalidGrantError],
  ])('maps %s to AUTH_EXPIRED', async (_name, makeError) => {
    answer(loadFixture('single'));
    api.filesGet.mockRejectedValue(makeError());
    const error = await readError();
    expect(error).toBeInstanceOf(SheetsReadError);
    expect((error as SheetsReadError).kind).toBe('AUTH_EXPIRED');
  });

  it('passes TeacherNotSignedInError through without calling Google', async () => {
    reader = new GoogleSheetsReader(new GoogleClientProvider(gateway));
    const error = await readError();
    expect(error).toBeInstanceOf(TeacherNotSignedInError);
    expect(api.sheetsGet).not.toHaveBeenCalled();
    expect(api.filesGet).not.toHaveBeenCalled();
  });

  it('passes other errors through unchanged', async () => {
    answer(loadFixture('single'));
    const badRequest = httpError(400);
    api.sheetsGet.mockRejectedValue(badRequest);
    expect(await readError()).toBe(badRequest);
  });
});
