import type { sheets_v4 } from '@googleapis/sheets';
import { beforeEach, describe, expect, it } from 'vitest';
import { TeacherNotSignedInError } from '../../src/auth/GoogleClientProvider.js';
import { GuidedNotesImporter } from '../../src/guided-notes/GuidedNotesImporter.js';
import { ImportStore } from '../../src/guided-notes/ImportStore.js';
import { SheetsReadError } from '../../src/guided-notes/SpreadsheetReader.js';
import type { ImportError, ImportSuccess } from '../../src/temp-shared/entities.js';
import { FakeSpreadsheetReader } from './helpers/fakeSpreadsheetReader.js';
import { buildSheet, loadFixture, rowsFrom } from './helpers/gridBuilder.js';

const ID = 'spreadsheet-id-0001';

let reader: FakeSpreadsheetReader;
let store: ImportStore;
let importer: GuidedNotesImporter;

function makeImporter(): GuidedNotesImporter {
  return new GuidedNotesImporter(reader, store);
}

function success(result: ImportSuccess | ImportError): ImportSuccess {
  if ('code' in result) throw new Error(`unexpected ImportError ${result.code}: ${result.reason}`);
  return result;
}

// The single template as "學習單" and the gaps variant as "第二份", in one spreadsheet.
function twoWorksheets(): sheets_v4.Schema$Spreadsheet {
  const book = loadFixture('single');
  const second = loadFixture('variant-gaps').sheets![0]!;
  second.properties = { sheetId: 2, title: '第二份', index: 1 };
  book.sheets!.push(second);
  return book;
}

beforeEach(() => {
  reader = new FakeSpreadsheetReader();
  store = new ImportStore();
  importer = makeImporter();
});

describe('GuidedNotesImporter.describe', () => {
  it('selects the first worksheet that has a header (AC-05)', async () => {
    reader.set(ID, loadFixture('multi-sheet'));
    expect(await importer.describe(ID)).toEqual({
      id: ID,
      title: '計算機概論基礎 學習單',
      editable: true,
      worksheets: ['說明', '學習單'],
      selectedWorksheet: '學習單',
    });
  });

  it('selects the first worksheet when none has a header', async () => {
    const book = {
      properties: { title: '沒有表頭' },
      sheets: [
        buildSheet(rowsFrom({ 1: { A: '封面' } }), [], { name: '封面', index: 0 }),
        buildSheet(rowsFrom({ 1: { A: 'No.', B: '學生填寫' } }), [], { name: '學習單', index: 1, sheetId: 1 }),
      ],
    };
    reader.set(ID, book);
    const spreadsheet = await importer.describe(ID);
    expect(spreadsheet.worksheets).toEqual(['封面', '學習單']);
    expect(spreadsheet.selectedWorksheet).toBe('封面');
  });

  it('does not change the ImportStore', async () => {
    reader.set(ID, twoWorksheets());
    await importer.describe(ID);
    expect(store.latest()).toBeNull();
    expect(store.latestMarkers()).toBeNull();

    const first = success(await importer.read(ID, '學習單'));
    await importer.describe(ID);
    expect(store.latest()).toEqual(first);
  });
});

describe('GuidedNotesImporter.read (success)', () => {
  it('returns the parsed worksheet and saves it with its markers (AC-02, AC-12)', async () => {
    reader.set(ID, loadFixture('multi-sheet'));
    const result = success(await importer.read(ID, '學習單'));
    expect(result.spreadsheet).toEqual({
      id: ID,
      title: '計算機概論基礎 學習單',
      editable: true,
      worksheets: ['說明', '學習單'],
      selectedWorksheet: '學習單',
    });
    expect(result.questions).toHaveLength(6);
    expect(store.latest()).toEqual(result);
    expect(store.latestMarkers()).toEqual({ G5: '', G7: '', G9: '', G11: '', G13: '', G15: '' });
  });

  it('replaces the stored result when another worksheet is read (AC-06)', async () => {
    reader.set(ID, twoWorksheets());
    success(await importer.read(ID, '學習單'));
    const second = success(await importer.read(ID, '第二份'));
    expect(second.spreadsheet.selectedWorksheet).toBe('第二份');
    expect(store.latest()).toEqual(second);
    expect(Object.keys(store.latestMarkers() ?? {})).toEqual(['G7', 'G10', 'G13', 'G16', 'G19', 'G22']);
  });

  it('imports a view-only spreadsheet with editable=false (AC-07)', async () => {
    reader.set(ID, loadFixture('single'), false);
    const result = success(await importer.read(ID, '學習單'));
    expect(result.spreadsheet.editable).toBe(false);
    expect(store.latest()?.spreadsheet.editable).toBe(false);
  });
});

describe('GuidedNotesImporter only reads the spreadsheet (AC-10)', () => {
  it('uses nothing but SpreadsheetReader.load()', async () => {
    reader.set(ID, loadFixture('multi-sheet'));
    const used: (string | symbol)[] = [];
    const watched = new Proxy(reader, {
      get(target, property, receiver) {
        used.push(property);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const watchedImporter = new GuidedNotesImporter(watched, store);
    await watchedImporter.describe(ID);
    await watchedImporter.read(ID, '學習單');
    expect(new Set(used)).toEqual(new Set(['load']));
    expect(reader.loadCalls).toEqual([ID, ID]);
  });
});

describe('GuidedNotesImporter failures leave the ImportStore unchanged (AC-18, SC-005)', () => {
  const BAD_SHEET = 'spreadsheet-id-bad01';
  const GONE = 'spreadsheet-id-gone1';

  let first: ImportSuccess;
  let firstMarkers: unknown;

  beforeEach(async () => {
    reader.set(ID, loadFixture('single'));
    reader.set(BAD_SHEET, {
      properties: { title: '表頭錯誤' },
      sheets: [buildSheet(rowsFrom({ 4: { B: 'No.', C: '內容', G: '學生填寫' }, 5: { B: 1 } }))],
    });
    first = success(await importer.read(ID, '學習單'));
    firstMarkers = store.latestMarkers();
  });

  function expectUnchanged(): void {
    expect(store.latest()).toEqual(first);
    expect(store.latestMarkers()).toEqual(firstMarkers);
  }

  it('after an ImportError from the worksheet content', async () => {
    const result = await importer.read(BAD_SHEET, '學習單');
    expect((result as ImportError).code).toBe('NO_HEADER');
    expectUnchanged();
  });

  it('returns NO_WORKSHEET for an unknown worksheet name (AC-24)', async () => {
    const result = (await importer.read(ID, '改名後的工作表')) as ImportError;
    expect(result.code).toBe('NO_WORKSHEET');
    expect(result.reason).toContain('「改名後的工作表」');
    expectUnchanged();
  });

  it('returns NO_ACCESS when Google refuses the spreadsheet (AC-23)', async () => {
    reader.fail(GONE, new SheetsReadError('NO_ACCESS'));
    const result = (await importer.read(GONE, '學習單')) as ImportError;
    expect(result.code).toBe('NO_ACCESS');
    expect(result.fixSteps.join('')).toContain('重新挑選');
    expectUnchanged();
  });

  it.each([
    ['SheetsReadError UNAVAILABLE', () => new SheetsReadError('UNAVAILABLE')],
    ['SheetsReadError AUTH_EXPIRED', () => new SheetsReadError('AUTH_EXPIRED')],
    ['TeacherNotSignedInError', () => new TeacherNotSignedInError()],
  ])('rethrows %s from read()', async (_name, makeError) => {
    const error = makeError();
    reader.fail(GONE, error);
    await expect(importer.read(GONE, '學習單')).rejects.toBe(error);
    expectUnchanged();
  });

  it.each([
    ['SheetsReadError NO_ACCESS', () => new SheetsReadError('NO_ACCESS')],
    ['SheetsReadError UNAVAILABLE', () => new SheetsReadError('UNAVAILABLE')],
    ['TeacherNotSignedInError', () => new TeacherNotSignedInError()],
  ])('rethrows %s from describe()', async (_name, makeError) => {
    const error = makeError();
    reader.fail(GONE, error);
    await expect(importer.describe(GONE)).rejects.toBe(error);
    expectUnchanged();
  });

  it('after describe() of another spreadsheet', async () => {
    reader.set(GONE, loadFixture('multi-sheet'));
    await importer.describe(GONE);
    expectUnchanged();
  });
});
