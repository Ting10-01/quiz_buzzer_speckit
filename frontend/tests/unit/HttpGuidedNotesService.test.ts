import { describe, expect, it, vi } from 'vitest';
import type { ImportSuccess, Spreadsheet } from '@quiz-buzzer/shared/entities';
import { ApiError } from '../../src/services/http/ApiClient';
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

  it('returns null without calling the server when the Picker is closed (AC-16)', async () => {
    const { api, service } = setup(null);
    await expect(service.pickSpreadsheet()).resolves.toBeNull();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('returns a 200 ImportError as is, so the page can show it on T-ImportError', async () => {
    const importError = {
      code: 'NO_HEADER',
      reason: '在「學習單」工作表找不到同時寫著題號欄與作答欄表頭的列，所以沒有匯入任何題目。',
      foundHeaders: ['No.', '內容'],
      acceptedHeaders: ['題號欄：題號、編號、題次'],
      fixSteps: ['改好後按「重新讀取」。'],
    };
    const { service } = setup(SHEET.id, importError);
    await expect(service.readWorksheet(SHEET.id, '學習單')).resolves.toEqual(importError);
  });

  it.each([
    new ApiError(401, 'GOOGLE_AUTH_EXPIRED', 'Google 授權已失效，請回首頁重新登入'),
    new ApiError(403, 'NO_ACCESS', '無法讀取這份試算表，請用「重新挑選」再挑一次'),
    new ApiError(502, 'GOOGLE_UNAVAILABLE', '連不上 Google，請稍後再試'),
    new ApiError(0, 'NETWORK', '連不上伺服器，請確認伺服器已啟動'),
  ])('passes ApiError $code through unchanged (AC-25, AC-26)', async (error) => {
    const { api, service } = setup();
    api.request.mockRejectedValue(error);
    await expect(service.pickSpreadsheet()).rejects.toBe(error);
    await expect(service.readWorksheet(SHEET.id, '學習單')).rejects.toBe(error);
  });

  it('passes the Picker UnexpectedError through unchanged', async () => {
    const { picker, service } = setup();
    const error = { message: '無法載入 Google 檔案選擇器，請確認網路連線' };
    picker.pick.mockRejectedValue(error);
    await expect(service.pickSpreadsheet()).rejects.toBe(error);
  });
});
