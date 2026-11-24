// E2E stand-ins for Google Picker and the 003 import API (003 research R2). The page gets the 001
// demonstration sheets (MockFixtures), so the 001 walks keep checking the same screens.
import type { Page } from '@playwright/test';
import { isImportSuccess } from '@quiz-buzzer/shared/guards';
import { MockFixtures, SPREADSHEET_ID } from '../../src/services/mock/MockFixtures';

const PICKER_SRC = 'https://apis.google.com/js/api.js';

// Takes (and clears) the result when the Picker opens, so one page can pick several times.
const PICKER_STUB = `window.gapi = { load: (name, options) => {
  window.google = window.google || {};
  window.google.picker = {
    Action: { PICKED: 'picked', CANCEL: 'cancel' },
    ViewId: { SPREADSHEETS: 'spreadsheets' },
    DocsView: class { setMimeTypes() { return this; } },
    PickerBuilder: class {
      addView() { return this; }
      setOAuthToken() { return this; }
      setDeveloperKey() { return this; }
      setAppId() { return this; }
      setCallback(callback) { this.callback = callback; return this; }
      build() {
        const callback = this.callback;
        return { setVisible: () => {
          const id = window.__pickerResult;
          delete window.__pickerResult;
          setTimeout(() => callback(id ? { action: 'picked', docs: [{ id }] } : { action: 'cancel' }), 0);
        } };
      }
    },
  };
  options.callback();
} };`;

/** Answers the Picker and /api/guided-notes/* inside the page with the 001 demonstration sheets. */
export async function fakeGuidedNotesApi(page: Page) {
  let badHeaderRead = false;
  await page.route(PICKER_SRC, (route) => route.fulfill({ contentType: 'text/javascript', body: PICKER_STUB }));
  await page.route('**/api/auth/picker-token', (route) =>
    route.fulfill({ json: { accessToken: 'e2e-access', apiKey: 'e2e-key', appId: '1' } }),
  );
  await page.route('**/api/guided-notes/spreadsheets/*', (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
    if (id === SPREADSHEET_ID.BAD_HEADER) badHeaderRead = false;
    return route.fulfill({ json: MockFixtures.spreadsheets.find((sheet) => sheet.id === id) });
  });
  await page.route('**/api/guided-notes/read', (route) => {
    const { spreadsheetId, worksheet } = route.request().postDataJSON() as { spreadsheetId: string; worksheet: string };
    let id = spreadsheetId;
    // Same as the 001 mock (M2): re-reading the bad-header sheet counts as "header fixed".
    if (id === SPREADSHEET_ID.BAD_HEADER) {
      if (badHeaderRead) id = SPREADSHEET_ID.GROUP_AND_SINGLE;
      else badHeaderRead = true;
    }
    const result = structuredClone(MockFixtures.importResults[id]!);
    if (isImportSuccess(result) && result.spreadsheet.worksheets.includes(worksheet)) {
      result.spreadsheet.selectedWorksheet = worksheet;
    }
    return route.fulfill({ json: result });
  });
}

/** The next Picker in the current page picks the sheet titled `title`, or is closed when null. */
export async function pickerWill(page: Page, title: string | null) {
  const id = title === null ? null : MockFixtures.spreadsheets.find((sheet) => sheet.title === title)!.id;
  // Wait until a Picker opened earlier has taken its result, or it would take this one.
  await page.waitForFunction(() => !('__pickerResult' in window));
  await page.evaluate((value) => {
    (window as unknown as { __pickerResult: string | null }).__pickerResult = value;
  }, id);
}
