import { describe, expect, it, vi } from 'vitest';
import type { ImportSuccess, Spreadsheet } from '@quiz-buzzer/shared/entities';
import { HttpGuidedNotesService } from '../../src/services/http/HttpGuidedNotesService';

const SHEET: Spreadsheet = {
  id: '1AbCdEfGhIjKlMn',
  title: '計算機概論基礎 學習單',
  editable: true,
  worksheets: ['說明', '學習單'],
  selectedWorksheet: '學習單',
};

const IMPORTED: ImportSuccess = {
  spreadsheet: SHEET,
  headerRow: 4,
  headerColumns: ['B', 'C', 'G'],
  questions: [{ number: 1, type: 'SINGLE', text: '題目', subQuestions: [{ index: 1, blankCell: 'G5' }] }],
};

function setup(pickResult: string | null = SHEET.id, response: unknown = SHEET) {
  const api = { request: vi.fn().mockResolvedValue(response) };
  const picker = { pick: vi.fn().mockResolvedValue(pickResult) };
  return { api, picker, service: new HttpGuidedNotesService(api, picker) };
}

describe('HttpGuidedNotesService', () => {
  it('pickSpreadsheet asks the server for the picked spreadsheet (contracts GET /spreadsheets/:id)', async () => {
    const { api, service } = setup();
    await expect(service.pickSpreadsheet()).resolves.toEqual(SHEET);
    expect(api.request).toHaveBeenCalledWith('GET', `/api/guided-notes/spreadsheets/${SHEET.id}`);
  });

  it('readWorksheet posts the id and worksheet and returns ImportSuccess as is', async () => {
    const { api, service } = setup(SHEET.id, IMPORTED);
    await expect(service.readWorksheet(SHEET.id, '學習單')).resolves.toEqual(IMPORTED);
    expect(api.request).toHaveBeenCalledWith('POST', '/api/guided-notes/read', {
      spreadsheetId: SHEET.id,
      worksheet: '學習單',
    });
  });
});
