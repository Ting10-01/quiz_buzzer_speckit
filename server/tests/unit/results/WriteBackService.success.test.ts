import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuidedNotesParser } from '../../../src/guided-notes/GuidedNotesParser.js';
import { ResultQuery } from '../../../src/results/ResultQuery.js';
import { WriteBackService } from '../../../src/results/WriteBackService.js';
import { loadFixture } from '../../guided-notes/helpers/gridBuilder.js';
import { FakeSpreadsheetWriter } from '../../helpers/FakeSpreadsheetWriter.js';
import {
  FakeSubmissionStore,
  finishedActivityScenario,
  groupNotesReader,
  importedStore,
  SPREADSHEET_ID,
  WORKSHEET,
  type ResultScenario,
} from '../../results/helpers/resultFakes.js';

// Local time 2026-11-23 09:05.
const NOW = new Date(2026, 10, 23, 9, 5);

// Q1 (group 3) and Q2 (group 2) are groups whose markers stay in G, so H gets only the answer (#34);
// Q3 has no winner; Q4 (group 5) is single.
const EXPECTED_CELLS = [
  { cell: 'H5', text: 'CPU' },
  { cell: 'H6', text: '作業系統' },
  { cell: 'H8', text: '演算法' },
  { cell: 'H9', text: '堆疊' },
  { cell: 'G13', text: 'IP' },
];

function setup(scenario: ResultScenario = finishedActivityScenario()) {
  const imports = importedStore();
  const reader = groupNotesReader();
  const writer = new FakeSpreadsheetWriter();
  const log = { info: vi.fn(), warn: vi.fn() };
  const service = new WriteBackService({
    activities: scenario.activities,
    imports,
    reader,
    query: new ResultQuery(scenario.activities, scenario.submissions),
    writer,
    log,
    now: () => NOW,
  });
  return { service, imports, reader, writer, log };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WriteBackService.writeBack succeeds', () => {
  it('reads, checks the layout with 003’s parser, backs up, then writes once (AC-12, REQ-RES-12, 13, 14)', async () => {
    const { service, imports, reader, writer } = setup();
    const load = vi.spyOn(reader, 'load');
    const parse = vi.spyOn(GuidedNotesParser.prototype, 'parse');
    const duplicate = vi.spyOn(writer, 'duplicateSheet');
    const write = vi.spyOn(writer, 'writeTexts');
    const save = vi.spyOn(imports, 'save');

    await service.writeBack();

    const order = [load, parse, duplicate, write].map((spy) => spy.mock.invocationCallOrder[0] ?? Infinity);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(load).toHaveBeenCalledWith(SPREADSHEET_ID);
    expect(writer.calls.map((c) => c.method)).toEqual(['duplicateSheet', 'writeTexts']);
    expect(save).not.toHaveBeenCalled();
  });

  it('backs up the worksheet by its sheetId under a timestamped name, right after it (AC-12, AC-17)', async () => {
    const { service, writer } = setup();
    await service.writeBack();
    expect(writer.callsOf('duplicateSheet')).toEqual([
      { method: 'duplicateSheet', spreadsheetId: SPREADSHEET_ID, sheetId: 0, newTitle: '學習單-備份-20261123-0905', insertIndex: 1 },
    ]);
  });

  it('puts the backup right after the worksheet when it is not the first one (REQ-RES-13, #33)', async () => {
    const { service, reader, writer } = setup();
    const book = loadFixture('group');
    const notes = book.sheets![0]!;
    // Listed out of order: Google's index decides the order, as in a real answer.
    book.sheets = [
      { properties: { sheetId: 7, title: '說明', index: 0 } },
      { ...notes, properties: { ...notes.properties, index: 2 } },
      { properties: { sheetId: 9, title: '學習單-備份-20261122-1000', index: 1 } },
    ];
    reader.set(SPREADSHEET_ID, book);
    await service.writeBack();
    expect(writer.callsOf('duplicateSheet')[0]).toMatchObject({ sheetId: 0, insertIndex: 3 });
  });

  it('writes exactly the blank cells of questions with a winner, markers left in G (AC-13a, AC-14, AC-15)', async () => {
    const { service, writer } = setup();
    await service.writeBack();
    expect(writer.callsOf('writeTexts')).toEqual([
      { method: 'writeTexts', spreadsheetId: SPREADSHEET_ID, worksheet: WORKSHEET, cells: EXPECTED_CELLS },
    ]);
  });

  it('returns the number of cells written (REQ-RES-20)', async () => {
    const { service } = setup();
    expect(await service.writeBack()).toEqual({ ok: true, cellCount: 5 });
  });

  it('writes marker + answer when the marker is in the blank cell (AC-13, REQ-RES-08)', async () => {
    const { service, writer, imports } = setup();
    const markers = { ...imports.latestMarkers()!, H5: { marker: '（1）', inBlankCell: true } };
    imports.save(imports.latest()!, markers);
    await service.writeBack();
    expect(writer.callsOf('writeTexts')[0]?.cells.slice(0, 2)).toEqual([
      { cell: 'H5', text: '（1）CPU' },
      { cell: 'H6', text: '作業系統' },
    ]);
  });

  it('writes only the answer when the marker is in the cell on the left (AC-13a, #34)', async () => {
    const { service, writer, imports } = setup();
    expect(imports.latestMarkers()?.H5).toEqual({ marker: '（1）', inBlankCell: false });
    await service.writeBack();
    expect(writer.callsOf('writeTexts')[0]?.cells[0]).toEqual({ cell: 'H5', text: 'CPU' });
  });

  it('does not read, back up or write when no question has a winner (AC-18)', async () => {
    const scenario = finishedActivityScenario();
    scenario.submissions = new FakeSubmissionStore();
    const { service, reader, writer } = setup(scenario);
    expect(await service.writeBack()).toEqual({ ok: true, cellCount: 0 });
    expect(reader.loadCalls).toEqual([]);
    expect(writer.calls).toEqual([]);
  });

  it('writes the same cells again on a second write-back, with a new backup (AC-19, REQ-RES-18)', async () => {
    const { service, writer } = setup();
    await service.writeBack();
    await service.writeBack();
    const [first, second] = writer.callsOf('writeTexts');
    expect(second?.cells).toEqual(first?.cells);
    expect(writer.callsOf('duplicateSheet')).toHaveLength(2);
  });
});
