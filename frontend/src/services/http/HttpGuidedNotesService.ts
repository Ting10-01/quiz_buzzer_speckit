// GuidedNotesService over the 003 HTTP API (contracts/guided-notes-http.md). Errors are not
// converted: ApiClient's ApiError and the Picker's UnexpectedError go straight to the page (R7).
import type { ImportError, ImportSuccess, Spreadsheet } from '@quiz-buzzer/shared/entities';
import type { GooglePickerLauncher } from '../google/GooglePickerLauncher';
import type { GuidedNotesService } from '../interfaces';
import type { ApiClient } from './ApiClient';

export class HttpGuidedNotesService implements GuidedNotesService {
  constructor(
    private readonly api: Pick<ApiClient, 'request'>,
    private readonly picker: Pick<GooglePickerLauncher, 'pick'>,
  ) {}

  async pickSpreadsheet(): Promise<Spreadsheet | null> {
    const id = await this.picker.pick();
    if (id === null) return null;
    return this.api.request<Spreadsheet>('GET', `/api/guided-notes/spreadsheets/${encodeURIComponent(id)}`);
  }

  readWorksheet(spreadsheetId: string, worksheet: string): Promise<ImportSuccess | ImportError> {
    // 200 carries either result; the page tells them apart with isImportError.
    return this.api.request('POST', '/api/guided-notes/read', { spreadsheetId, worksheet });
  }
}
