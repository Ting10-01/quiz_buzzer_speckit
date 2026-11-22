import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PickPage } from '../../src/pages/teacher/PickPage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';

function setup() {
  const navigate = vi.fn();
  const registry = createFakeRegistry({
    auth: {
      getCurrentAccount: vi.fn().mockResolvedValue({ name: '模擬老師', email: 'teacher@example.com' }),
    },
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
