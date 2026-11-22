import { describe, expect, it } from 'vitest';
import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import { isImportError, isImportSuccess } from '@quiz-buzzer/shared/guards';
import type { ChoiceRequest } from '../../src/services/interfaces';
import { MockGuidedNotesService } from '../../src/services/mock/MockGuidedNotesService';
import { SPREADSHEET_ID } from '../../src/services/mock/MockFixtures';
import { MockSession } from '../../src/services/mock/MockSession';

function blankCount(result: ImportSuccess) {
  return result.questions.reduce((sum, q) => sum + q.subQuestions.length, 0);
}

async function pickAndRead(id: string) {
  const session = new MockSession();
  session.onRequest(() => session.answer(id));
  const notes = new MockGuidedNotesService(session);
  const sheet = await notes.pickSpreadsheet();
  const result = await notes.readWorksheet(sheet!.id, sheet!.selectedWorksheet);
  return { session, notes, sheet: sheet!, result };
}

describe('MockGuidedNotesService (M2)', () => {
  it('lists the three mock spreadsheets in the chooser', async () => {
    const session = new MockSession();
    const requests: ChoiceRequest[] = [];
    session.onRequest((request) => {
      requests.push(request);
      session.answer(null);
    });
    await new MockGuidedNotesService(session).pickSpreadsheet();
    expect(requests[0]?.title).toBe('模擬檔案選擇器');
    expect(requests[0]?.options.map((o) => o.label)).toEqual([
      '題組＋單題範本',
      '單題範本',
      '表頭錯誤範例',
    ]);
  });

  it('recognises the group + single template and records lastImport', async () => {
    const { session, result } = await pickAndRead(SPREADSHEET_ID.GROUP_AND_SINGLE);
    if (!isImportSuccess(result)) throw new Error('expected success');
    expect(result.questions).toHaveLength(4);
    expect(result.questions.filter((q) => q.type === 'GROUP')).toHaveLength(2);
    expect(blankCount(result)).toBe(6);
    expect(result.spreadsheet.editable).toBe(true);
    expect(session.lastImport).toEqual(result);
  });

  it('recognises the single template as view-only', async () => {
    const { result } = await pickAndRead(SPREADSHEET_ID.SINGLE_ONLY);
    if (!isImportSuccess(result)) throw new Error('expected success');
    expect(result.questions).toHaveLength(6);
    expect(result.questions.every((q) => q.type === 'SINGLE')).toBe(true);
    expect(blankCount(result)).toBe(6);
    expect(result.spreadsheet.editable).toBe(false);
  });

  it('returns ImportError for the bad header sheet, then the fixed result on re-read', async () => {
    const { notes, sheet, result, session } = await pickAndRead(SPREADSHEET_ID.BAD_HEADER);
    expect(isImportError(result)).toBe(true);
    expect(session.lastImport).toBeUndefined();
    const again = await notes.readWorksheet(sheet.id, sheet.selectedWorksheet);
    if (!isImportSuccess(again)) throw new Error('expected success');
    expect(again.spreadsheet.id).toBe(SPREADSHEET_ID.GROUP_AND_SINGLE);
    expect(again.questions).toHaveLength(4);
  });

  it('returns null when the chooser is closed (edge)', async () => {
    const session = new MockSession();
    session.onRequest(() => session.answer(null));
    await expect(new MockGuidedNotesService(session).pickSpreadsheet()).resolves.toBeNull();
  });
});
