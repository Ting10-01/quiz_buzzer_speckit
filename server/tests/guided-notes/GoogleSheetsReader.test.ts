import { drive } from '@googleapis/drive';
import { sheets } from '@googleapis/sheets';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleClientProvider } from '../../src/auth/GoogleClientProvider.js';
import { GoogleSheetsReader } from '../../src/guided-notes/GoogleSheetsReader.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';
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

function answer(book: unknown, canEdit: boolean | undefined = true): void {
  api.sheetsGet.mockResolvedValue({ data: book });
  api.filesGet.mockResolvedValue({ data: canEdit === undefined ? {} : { capabilities: { canEdit } } });
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
    [undefined, false],
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
});
