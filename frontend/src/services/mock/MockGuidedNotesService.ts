// M2: mock file chooser and worksheet recognition.
import type { ImportError, ImportSuccess, Spreadsheet } from '@quiz-buzzer/shared/entities';
import { isImportSuccess } from '@quiz-buzzer/shared/guards';
import type { GuidedNotesService } from '../interfaces';
import { MockFixtures, SPREADSHEET_ID } from './MockFixtures';
import { MOCK_UNEXPECTED_ERROR, type MockSession } from './MockSession';

export class MockGuidedNotesService implements GuidedNotesService {
  /** Set once the bad-header sheet has been read; a re-read counts as "header fixed" (M2). */
  private badHeaderRead = false;

  constructor(private readonly session: MockSession) {}

  async pickSpreadsheet(): Promise<Spreadsheet | null> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    const choice = await this.session.requestChoice({
      title: '模擬檔案選擇器',
      options: MockFixtures.spreadsheets.map((sheet) => ({ id: sheet.id, label: sheet.title })),
    });
    const sheet = MockFixtures.spreadsheets.find((s) => s.id === choice);
    if (!sheet) return null;
    if (sheet.id === SPREADSHEET_ID.BAD_HEADER) this.badHeaderRead = false;
    return structuredClone(sheet);
  }

  async readWorksheet(spreadsheetId: string, worksheet: string): Promise<ImportSuccess | ImportError> {
    if (this.session.consumeUnexpectedError()) throw MOCK_UNEXPECTED_ERROR;
    let id = spreadsheetId;
    if (id === SPREADSHEET_ID.BAD_HEADER) {
      if (this.badHeaderRead) {
        id = SPREADSHEET_ID.GROUP_AND_SINGLE;
      } else {
        this.badHeaderRead = true;
      }
    }
    const fixture = MockFixtures.importResults[id];
    if (!fixture) throw new Error(`Unknown mock spreadsheet: ${spreadsheetId}`);
    const result = structuredClone(fixture);
    if (!isImportSuccess(result)) return result;
    if (result.spreadsheet.worksheets.includes(worksheet)) {
      result.spreadsheet.selectedWorksheet = worksheet;
    }
    this.session.lastImport = result;
    return structuredClone(result);
  }
}
