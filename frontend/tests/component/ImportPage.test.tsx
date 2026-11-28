import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImportError, ImportSuccess, Spreadsheet } from '@quiz-buzzer/shared/entities';
import { ImportPage } from '../../src/pages/teacher/ImportPage';
import type { GuidedNotesService } from '../../src/services/interfaces';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import {
  makeImportError,
  makeImportSuccess,
  makeMixedQuestions,
  makeQuestions,
  makeSpreadsheet,
} from '../helpers/fixtures';

const UNEXPECTED = { message: '模擬：連不上伺服器' };

function renderImport(result: ImportSuccess, guidedNotes: Partial<GuidedNotesService> = {}) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({ guidedNotes });
  renderWithRegistry(<ImportPage navigate={navigate} page={{ id: 'T-Import', result }} />, registry);
  return { navigate, registry };
}

function renderImportError(
  spreadsheet: Spreadsheet,
  error: ImportError,
  guidedNotes: Partial<GuidedNotesService> = {},
) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({ guidedNotes });
  renderWithRegistry(
    <ImportPage navigate={navigate} page={{ id: 'T-ImportError', spreadsheet, error }} />,
    registry,
  );
  return { navigate, registry };
}

/** Value of a summary statistic rendered as <dt>label</dt><dd>value</dd>. */
function statValue(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}

describe('ImportPage (T-Import) display (FR-021)', () => {
  it('shows title, editable state, header row and columns, and the counts (US2 AC-1)', () => {
    renderImport(makeImportSuccess());
    expect(screen.getByText('Sheet A Title')).toBeInTheDocument();
    expect(screen.getByText('可編輯')).toBeInTheDocument();
    expect(screen.queryByText('僅檢視')).not.toBeInTheDocument();
    expect(screen.getByText(/第 4 列/)).toBeInTheDocument();
    expect(screen.getByText(/題號在 B 欄、題目在 C 欄、作答在 G 欄/)).toBeInTheDocument();
    expect(statValue('題數')).toBe('4');
    expect(statValue('題組數')).toBe('2');
    expect(statValue('填空格數')).toBe('6');
  });

  it('marks a read-only spreadsheet as 僅檢視 and counts single-only sheets (US2 AC-2)', () => {
    renderImport(
      makeImportSuccess({
        spreadsheet: makeSpreadsheet({ editable: false }),
        questions: makeQuestions(6),
      }),
    );
    expect(screen.getByText('僅檢視')).toBeInTheDocument();
    expect(screen.queryByText('可編輯')).not.toBeInTheDocument();
    expect(statValue('題數')).toBe('6');
    expect(statValue('題組數')).toBe('0');
    expect(statValue('填空格數')).toBe('6');
  });

  it('lists every question by number with its type and blank cells', () => {
    renderImport(makeImportSuccess());
    const row1 = screen.getByRole('row', { name: /第 1 題/ });
    expect(row1).toHaveTextContent('題組・2 小題');
    expect(row1).toHaveTextContent('G5、G6');
    const row3 = screen.getByRole('row', { name: /第 3 題/ });
    expect(row3).toHaveTextContent('單題');
    expect(row3).toHaveTextContent('G11');
  });

  it('shows a preview with the header columns, question texts and marked blank cells', () => {
    renderImport(makeImportSuccess());
    const preview = screen.getByRole('region', { name: '學習單預覽' });
    expect(within(preview).getByText('Group question one')).toBeInTheDocument();
    expect(within(preview).getByText('Single question four')).toBeInTheDocument();
    for (const cell of ['G5', 'G6', 'G8', 'G9', 'G11', 'G13']) {
      expect(within(preview).getByText(cell)).toBeInTheDocument();
    }
  });

  it('shows one worksheet tab per worksheet with the selected one marked', () => {
    renderImport(makeImportSuccess());
    const tabs = within(screen.getByRole('tablist', { name: '工作表' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['學習單', '備註']);
    expect(screen.getByRole('tab', { name: '學習單' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '備註' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('ImportPage (T-Import) buttons', () => {
  it('switching worksheet reads it and goes to T-Import on ImportSuccess (T4)', async () => {
    const next = makeImportSuccess({
      spreadsheet: makeSpreadsheet({ selectedWorksheet: '備註' }),
      questions: makeQuestions(2),
    });
    const { navigate, registry } = renderImport(makeImportSuccess(), {
      readWorksheet: vi.fn().mockResolvedValue(next),
    });
    await userEvent.click(screen.getByRole('tab', { name: '備註' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: 'T-Import', result: next }));
    expect(registry.guidedNotes.readWorksheet).toHaveBeenCalledWith('sheet-a', '備註');
  });

  it('switching worksheet goes to T-ImportError for that worksheet on ImportError (T5)', async () => {
    const error = makeImportError();
    const { navigate } = renderImport(makeImportSuccess(), {
      readWorksheet: vi.fn().mockResolvedValue(error),
    });
    await userEvent.click(screen.getByRole('tab', { name: '備註' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        id: 'T-ImportError',
        spreadsheet: expect.objectContaining({ id: 'sheet-a', selectedWorksheet: '備註' }),
        error,
      }),
    );
  });

  it('"重新挑選" stays when the picker is closed (edge)', async () => {
    const { navigate, registry } = renderImport(makeImportSuccess(), {
      pickSpreadsheet: vi.fn().mockResolvedValue(null),
    });
    await userEvent.click(screen.getByRole('button', { name: '重新挑選' }));
    await waitFor(() => expect(registry.guidedNotes.pickSpreadsheet).toHaveBeenCalledTimes(1));
    expect(registry.guidedNotes.readWorksheet).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Sheet A Title')).toBeInTheDocument();
  });

  it('"重新挑選" reads the newly picked sheet and goes to T-Import', async () => {
    const sheet = makeSpreadsheet({ id: 'other', title: 'Other' });
    const next = makeImportSuccess({ spreadsheet: sheet });
    const { navigate, registry } = renderImport(makeImportSuccess(), {
      pickSpreadsheet: vi.fn().mockResolvedValue(sheet),
      readWorksheet: vi.fn().mockResolvedValue(next),
    });
    await userEvent.click(screen.getByRole('button', { name: '重新挑選' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: 'T-Import', result: next }));
    expect(registry.guidedNotes.readWorksheet).toHaveBeenCalledWith('other', '學習單');
  });

  it('"取消" goes to T-Pick without a service call', async () => {
    const { navigate, registry } = renderImport(makeImportSuccess());
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Pick' });
    expect(registry.guidedNotes.pickSpreadsheet).not.toHaveBeenCalled();
    expect(registry.guidedNotes.readWorksheet).not.toHaveBeenCalled();
  });

  it('"確認匯入，下一步" goes to T-Setup in create mode without a service call (US2 AC-6)', async () => {
    const result = makeImportSuccess();
    const { navigate, registry } = renderImport(result);
    await userEvent.click(screen.getByRole('button', { name: '確認匯入，下一步' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'T-Setup', mode: 'create', result });
    expect(registry.guidedNotes.pickSpreadsheet).not.toHaveBeenCalled();
    expect(registry.guidedNotes.readWorksheet).not.toHaveBeenCalled();
  });

  it('stays and shows an unexpected error in the error area (FR-009)', async () => {
    const { navigate } = renderImport(makeImportSuccess(), {
      readWorksheet: vi.fn().mockRejectedValue(UNEXPECTED),
    });
    await userEvent.click(screen.getByRole('tab', { name: '備註' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Sheet A Title')).toBeInTheDocument();
  });
});

describe('ImportPage (T-ImportError) (FR-022)', () => {
  it('shows the reason, current headers, accepted headers and fix steps (US2 AC-3)', () => {
    renderImportError(makeSpreadsheet({ id: 'bad' }), makeImportError());
    expect(screen.getByText('Header row was not found')).toBeInTheDocument();
    for (const text of [
      'No.',
      'Content',
      'Answer here',
      'Number column: 題號',
      'Answer column: 作答',
      'Rename the headers',
      'Press reload',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '重新挑選' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新讀取' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '確認匯入，下一步' })).not.toBeInTheDocument();
  });

  it('"重新讀取" re-reads the same worksheet and goes to T-Import on success (US2 AC-4)', async () => {
    const sheet = makeSpreadsheet({ id: 'bad', selectedWorksheet: '備註' });
    const fixed = makeImportSuccess({ spreadsheet: sheet });
    const { navigate, registry } = renderImportError(sheet, makeImportError(), {
      readWorksheet: vi.fn().mockResolvedValue(fixed),
    });
    await userEvent.click(screen.getByRole('button', { name: '重新讀取' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: 'T-Import', result: fixed }));
    expect(registry.guidedNotes.readWorksheet).toHaveBeenCalledWith('bad', '備註');
  });

  it('"重新讀取" stays on T-ImportError with the new error when it still fails (edge, T8)', async () => {
    const sheet = makeSpreadsheet({ id: 'bad' });
    const stillBad = makeImportError({ reason: 'Still no header row' });
    const { navigate } = renderImportError(sheet, makeImportError(), {
      readWorksheet: vi.fn().mockResolvedValue(stillBad),
    });
    await userEvent.click(screen.getByRole('button', { name: '重新讀取' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ id: 'T-ImportError', spreadsheet: sheet, error: stillBad }),
    );
    expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'T-Import' }));
  });

  it('"重新挑選" stays when the picker is closed (edge)', async () => {
    const { navigate, registry } = renderImportError(makeSpreadsheet({ id: 'bad' }), makeImportError(), {
      pickSpreadsheet: vi.fn().mockResolvedValue(null),
    });
    await userEvent.click(screen.getByRole('button', { name: '重新挑選' }));
    await waitFor(() => expect(registry.guidedNotes.pickSpreadsheet).toHaveBeenCalledTimes(1));
    expect(registry.guidedNotes.readWorksheet).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays and shows an unexpected error in the error area (FR-009)', async () => {
    const { navigate } = renderImportError(makeSpreadsheet({ id: 'bad' }), makeImportError(), {
      readWorksheet: vi.fn().mockRejectedValue(UNEXPECTED),
    });
    await userEvent.click(screen.getByRole('button', { name: '重新讀取' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Header row was not found')).toBeInTheDocument();
  });
});

// Phase 8.8 (issue #16): headerColumns are number, text (only if found) and answer (FR-021).
describe('ImportPage (T-Import) header columns as recognised (FR-021, #16)', () => {
  const preview = () => screen.getByRole('region', { name: '學習單預覽' });
  const previewColumns = () =>
    within(preview())
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
      .filter((text) => text !== '');
  const previewHeaderRow = () =>
    within(preview())
      .getAllByRole('row')[1]
      .querySelectorAll('td');

  it('names the number, text and answer columns when there are three (T167)', () => {
    renderImport(makeImportSuccess({ headerColumns: ['B', 'C', 'G'] }));
    expect(screen.getByText(/題號在 B 欄、題目在 C 欄、作答在 G 欄。/)).toBeInTheDocument();
    expect(previewColumns()).toEqual(['B', 'C', 'G']);
    expect([...previewHeaderRow()].map((td) => td.textContent)).toEqual(['題號欄', '題目欄', '作答欄']);
  });

  it('names only the number and answer columns when there is no text column (T167)', () => {
    renderImport(makeImportSuccess({ headerColumns: ['B', 'G'] }));
    expect(screen.getByText(/題號在 B 欄、作答在 G 欄。/)).toBeInTheDocument();
    expect(screen.queryByText(/題目在/)).not.toBeInTheDocument();
    expect(previewColumns()).toEqual(['B', 'G']);
    expect([...previewHeaderRow()].map((td) => td.textContent)).toEqual(['題號欄', '作答欄']);
    for (const cell of ['G5', 'G6', 'G8', 'G9', 'G11', 'G13']) {
      expect(within(preview()).getByText(cell)).toBeInTheDocument();
    }
  });
});

// Phase 8.11 (issue #35): the answer columns come from where the blank cells actually are (FR-021).
describe('ImportPage (T-Import) answer columns from blank cells (FR-021, #35)', () => {
  const preview = () => screen.getByRole('region', { name: '學習單預覽' });
  const previewColumns = () =>
    within(preview())
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
      .filter((text) => text !== '');

  /** The mixed questions with their blank cells replaced in order, e.g. ['H5', 'H6', ...]. */
  function withBlankCells(cells: string[]) {
    let next = 0;
    return makeMixedQuestions().map((question) => ({
      ...question,
      subQuestions: question.subQuestions.map((sub) => ({ ...sub, blankCell: cells[next++] ?? sub.blankCell })),
    }));
  }

  it('lists every answer column when the blank cells sit in G and H (T176)', () => {
    const cells = ['H5', 'H6', 'H8', 'H9', 'G11', 'G13'];
    renderImport(makeImportSuccess({ headerColumns: ['B', 'C', 'G'], questions: withBlankCells(cells) }));
    expect(screen.getByText(/題號在 B 欄、題目在 C 欄、作答在 G、H 欄。/)).toBeInTheDocument();
    expect(previewColumns()).toEqual(['B', 'C', 'G、H']);
    for (const cell of cells) {
      expect(within(preview()).getByText(cell)).toBeInTheDocument();
    }
  });

  it('orders the answer columns left to right, Z before AA (T176)', () => {
    renderImport(
      makeImportSuccess({ headerColumns: ['B', 'G'], questions: withBlankCells(['H5', 'AA6', 'Z8', 'H9', 'Z11', 'AA13']) }),
    );
    expect(screen.getByText(/題號在 B 欄、作答在 H、Z、AA 欄。/)).toBeInTheDocument();
    expect(previewColumns()).toEqual(['B', 'H、Z、AA']);
  });

  it('keeps a single answer column when every blank cell is in G (T176)', () => {
    renderImport(makeImportSuccess({ headerColumns: ['B', 'C', 'G'] }));
    expect(screen.getByText(/作答在 G 欄。/)).toBeInTheDocument();
    expect(previewColumns()).toEqual(['B', 'C', 'G']);
  });
});
