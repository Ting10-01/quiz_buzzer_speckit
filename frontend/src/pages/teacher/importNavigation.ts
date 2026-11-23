// Navigation rules shared by T-Pick, T-Import and T-ImportError (spec "頁面與按鈕"):
// a read result decides between T-Import and T-ImportError; a closed picker stays.
import type { Spreadsheet } from '@quiz-buzzer/shared/entities';
import { isImportError } from '@quiz-buzzer/shared/guards';
import type { PageState } from '../../app/AppRouter';
import type { GuidedNotesService } from '../../services/interfaces';

/** Reads one worksheet and returns the page that shows the result. */
export async function readToPage(
  guidedNotes: GuidedNotesService,
  spreadsheet: Spreadsheet,
  worksheet: string,
): Promise<PageState> {
  const result = await guidedNotes.readWorksheet(spreadsheet.id, worksheet);
  return isImportError(result)
    ? { id: 'T-ImportError', spreadsheet: { ...spreadsheet, selectedWorksheet: worksheet }, error: result }
    : { id: 'T-Import', result };
}

/** Opens the picker, then reads the picked sheet's selected worksheet. null when the picker is closed. */
export async function pickToPage(guidedNotes: GuidedNotesService): Promise<PageState | null> {
  const spreadsheet = await guidedNotes.pickSpreadsheet();
  if (!spreadsheet) return null;
  return readToPage(guidedNotes, spreadsheet, spreadsheet.selectedWorksheet);
}
