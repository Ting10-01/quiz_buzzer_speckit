import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PickPage } from '../../src/pages/teacher/PickPage';
import type { GuidedNotesService } from '../../src/services/interfaces';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeImportError, makeImportSuccess, makeSpreadsheet } from '../helpers/fixtures';

function setup(guidedNotes: Partial<GuidedNotesService> = {}) {
  const navigate = vi.fn();
  const registry = createFakeRegistry({
    auth: {
      getCurrentAccount: vi.fn().mockResolvedValue({ name: '模擬老師', email: 'teacher@example.com' }),
    },
    guidedNotes,
  });
  renderWithRegistry(<PickPage navigate={navigate} />, registry);
  return { navigate, registry };
}

describe('PickPage (T-Pick) display', () => {
  it('shows the signed-in account (FR-020, US1 AC-3)', async () => {
    const { registry } = setup();
    expect(await screen.findByText('模擬老師')).toBeInTheDocument();
    expect(screen.getByText('teacher@example.com')).toBeInTheDocument();
    expect(registry.auth.getCurrentAccount).toHaveBeenCalledTimes(1);
  });

  it('"取消" goes to Main without a service call', async () => {
    const { navigate, registry } = setup();
    await screen.findByText('模擬老師');
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(navigate).toHaveBeenCalledWith({ id: 'Main' });
    expect(registry.guidedNotes.pickSpreadsheet).not.toHaveBeenCalled();
  });

  it('offers the Drive picker and no account linking (SC-004)', async () => {
    setup();
    await screen.findByText('模擬老師');
    expect(screen.getByRole('button', { name: '從 Google 雲端硬碟挑選' })).toBeInTheDocument();
    expect(screen.queryByText(/連結 Google 帳號|解除連結/)).not.toBeInTheDocument();
  });
});

describe('PickPage (T-Pick) Drive picker (FR-020, US2 AC-1–5)', () => {
  const pickButton = () => screen.getByRole('button', { name: '從 Google 雲端硬碟挑選' });

  it('stays and does not read a worksheet when the picker is closed (edge, US2 AC-5)', async () => {
    const { navigate, registry } = setup({ pickSpreadsheet: vi.fn().mockResolvedValue(null) });
    await screen.findByText('模擬老師');
    await userEvent.click(pickButton());
    await waitFor(() => expect(registry.guidedNotes.pickSpreadsheet).toHaveBeenCalledTimes(1));
    expect(registry.guidedNotes.readWorksheet).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(pickButton()).toBeInTheDocument();
  });

  it('reads the selected worksheet and goes to T-Import on ImportSuccess (US2 AC-1, AC-2)', async () => {
    const sheet = makeSpreadsheet({ id: 'picked', worksheets: ['A', 'B'], selectedWorksheet: 'B' });
    const result = makeImportSuccess({ spreadsheet: sheet });
    const { navigate, registry } = setup({
      pickSpreadsheet: vi.fn().mockResolvedValue(sheet),
      readWorksheet: vi.fn().mockResolvedValue(result),
    });
    await screen.findByText('模擬老師');
    await userEvent.click(pickButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: 'T-Import', result }));
    expect(registry.guidedNotes.readWorksheet).toHaveBeenCalledWith('picked', 'B');
  });

  it('goes to T-ImportError with the spreadsheet on ImportError (US2 AC-3)', async () => {
    const sheet = makeSpreadsheet({ id: 'bad' });
    const error = makeImportError();
    const { navigate, registry } = setup({
      pickSpreadsheet: vi.fn().mockResolvedValue(sheet),
      readWorksheet: vi.fn().mockResolvedValue(error),
    });
    await screen.findByText('模擬老師');
    await userEvent.click(pickButton());
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ id: 'T-ImportError', spreadsheet: sheet, error }),
    );
    expect(registry.guidedNotes.readWorksheet).toHaveBeenCalledWith('bad', '學習單');
  });

  it('stays and shows an unexpected error in the error area (FR-009)', async () => {
    const { navigate } = setup({
      pickSpreadsheet: vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' }),
    });
    await screen.findByText('模擬老師');
    await userEvent.click(pickButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
    expect(navigate).not.toHaveBeenCalled();
  });
});
