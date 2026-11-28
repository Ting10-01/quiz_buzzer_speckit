import { sheets } from '@googleapis/sheets';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleClientProvider, TeacherNotSignedInError } from '../../../src/auth/GoogleClientProvider.js';
import { GoogleSheetsWriter } from '../../../src/results/GoogleSheetsWriter.js';
import { googleError } from '../../helpers/FakeSpreadsheetWriter.js';
import { FakeGoogleGateway, signInFor } from '../../helpers/fakeGoogleGateway.js';

const api = vi.hoisted(() => ({ batchUpdate: vi.fn(), valuesBatchUpdate: vi.fn() }));

vi.mock('@googleapis/sheets', () => ({
  sheets: vi.fn(() => ({
    spreadsheets: { batchUpdate: api.batchUpdate, values: { batchUpdate: api.valuesBatchUpdate } },
  })),
}));

const ID = 'spreadsheet-id-0001';
const TIMEOUT = { timeout: 15_000 };

let gateway: FakeGoogleGateway;
let clients: GoogleClientProvider;
let writer: GoogleSheetsWriter;

beforeEach(() => {
  vi.clearAllMocks();
  api.batchUpdate.mockResolvedValue({ data: {} });
  api.valuesBatchUpdate.mockResolvedValue({ data: {} });
  gateway = new FakeGoogleGateway();
  clients = new GoogleClientProvider(gateway);
  clients.replace(signInFor('teacher.a@example.com').tokens);
  writer = new GoogleSheetsWriter(clients);
});

describe('GoogleSheetsWriter.writeTexts', () => {
  it('sends every cell in one values.batchUpdate with RAW, so "=1+1" stays text (AC-16, REQ-RES-11)', async () => {
    await writer.writeTexts(ID, '學習單', [
      { cell: 'G5', text: '（1）CPU' },
      { cell: 'G13', text: '=1+1' },
    ]);
    expect(api.valuesBatchUpdate).toHaveBeenCalledTimes(1);
    expect(api.valuesBatchUpdate).toHaveBeenCalledWith(
      {
        spreadsheetId: ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: "'學習單'!G5", values: [['（1）CPU']] },
            { range: "'學習單'!G13", values: [['=1+1']] },
          ],
        },
      },
      TIMEOUT,
    );
    expect(api.batchUpdate).not.toHaveBeenCalled();
  });

  it("doubles a ' in the worksheet name", async () => {
    await writer.writeTexts(ID, "Amy's 學習單", [{ cell: 'B2', text: 'x' }]);
    expect(api.valuesBatchUpdate.mock.calls[0]?.[0].requestBody.data[0].range).toBe("'Amy''s 學習單'!B2");
  });

  it('rethrows what Google throws', async () => {
    const error = googleError(500);
    api.valuesBatchUpdate.mockRejectedValue(error);
    await expect(writer.writeTexts(ID, '學習單', [{ cell: 'G5', text: 'x' }])).rejects.toBe(error);
  });
});

describe('GoogleSheetsWriter.duplicateSheet', () => {
  it('sends one duplicateSheet request that puts the copy at insertIndex (REQ-RES-13, #33)', async () => {
    await writer.duplicateSheet(ID, 42, '學習單-備份-20261123-0905', 3);
    expect(api.batchUpdate).toHaveBeenCalledTimes(1);
    expect(api.batchUpdate).toHaveBeenCalledWith(
      {
        spreadsheetId: ID,
        requestBody: {
          requests: [{ duplicateSheet: { sourceSheetId: 42, newSheetName: '學習單-備份-20261123-0905', insertSheetIndex: 3 } }],
        },
      },
      TIMEOUT,
    );
    expect(api.valuesBatchUpdate).not.toHaveBeenCalled();
  });

  it('rethrows what Google throws', async () => {
    const error = googleError(403);
    api.batchUpdate.mockRejectedValue(error);
    await expect(writer.duplicateSheet(ID, 0, 'x', 1)).rejects.toBe(error);
  });
});

describe('GoogleSheetsWriter authorization', () => {
  it('asks app.googleClients for the authorized client on every call', async () => {
    await writer.duplicateSheet(ID, 0, 'x', 1);
    expect(vi.mocked(sheets).mock.calls[0]?.[0]).toEqual(expect.objectContaining({ version: 'v4', auth: gateway.lastClient }));
    clients.replace(signInFor('teacher.b@example.com').tokens);
    await writer.writeTexts(ID, '學習單', [{ cell: 'G5', text: 'x' }]);
    expect(vi.mocked(sheets).mock.calls[1]?.[0]).toEqual(expect.objectContaining({ auth: gateway.lastClient }));
  });

  it('throws TeacherNotSignedInError without a signed-in teacher and calls nothing', async () => {
    writer = new GoogleSheetsWriter(new GoogleClientProvider(gateway));
    await expect(writer.writeTexts(ID, '學習單', [{ cell: 'G5', text: 'x' }])).rejects.toBeInstanceOf(TeacherNotSignedInError);
    await expect(writer.duplicateSheet(ID, 0, 'x', 1)).rejects.toBeInstanceOf(TeacherNotSignedInError);
    expect(api.valuesBatchUpdate).not.toHaveBeenCalled();
    expect(api.batchUpdate).not.toHaveBeenCalled();
  });
});
