import { describe, expect, it } from 'vitest';
import { ImportStore } from '../../src/guided-notes/ImportStore.js';
import type { ImportSuccess } from '../../src/temp-shared/entities.js';

function result(title: string, blankCell: string): ImportSuccess {
  return {
    spreadsheet: { id: 'sheet-id-0001', title, editable: true, worksheets: ['學習單'], selectedWorksheet: '學習單' },
    headerRow: 4,
    headerColumns: ['B', 'C', 'G'],
    questions: [{ number: 1, type: 'SINGLE', text: '題目', subQuestions: [{ index: 1, blankCell }] }],
  };
}

describe('ImportStore', () => {
  it('is empty before the first save', () => {
    const store = new ImportStore();
    expect(store.latest()).toBeNull();
    expect(store.latestMarkers()).toBeNull();
  });

  it('returns what was saved', () => {
    const store = new ImportStore();
    store.save(result('A', 'G5'), { G5: '（1）' });
    expect(store.latest()).toEqual(result('A', 'G5'));
    expect(store.latestMarkers()).toEqual({ G5: '（1）' });
  });

  it('replaces the result and the markers together', () => {
    const store = new ImportStore();
    store.save(result('A', 'G5'), { G5: '（1）' });
    store.save(result('B', 'G7'), { G7: '' });
    expect(store.latest()).toEqual(result('B', 'G7'));
    expect(store.latestMarkers()).toEqual({ G7: '' });
  });

  it('keeps its own copy of the saved objects', () => {
    const store = new ImportStore();
    const saved = result('A', 'G5');
    const markers: Record<string, string> = { G5: '（1）' };
    store.save(saved, markers);

    saved.spreadsheet.title = 'changed';
    saved.questions[0]!.subQuestions[0]!.blankCell = 'Z99';
    saved.questions.push({ number: 2, type: 'SINGLE', subQuestions: [{ index: 1, blankCell: 'G7' }] });
    markers.G5 = 'changed';
    markers.G7 = '';

    expect(store.latest()).toEqual(result('A', 'G5'));
    expect(store.latestMarkers()).toEqual({ G5: '（1）' });
  });
});
