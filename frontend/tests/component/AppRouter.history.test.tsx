import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppRouter } from '../../src/app/AppRouter';
import type { ChoiceRequest } from '../../src/services/interfaces';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeActivity, makeImportSuccess, makeSpreadsheet } from '../helpers/fixtures';

let pushState: MockInstance<History['pushState']>;

beforeEach(() => {
  pushState = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  pushState.mockRestore();
});

function setup() {
  let notify: (request: ChoiceRequest) => void = () => {};
  const choicePrompt = {
    onRequest: vi.fn((listener: (request: ChoiceRequest) => void) => {
      notify = listener;
      return () => {};
    }),
    answer: vi.fn(),
  };
  const registry = createFakeRegistry({
    isMockMode: true,
    choicePrompt,
    auth: {
      signInWithGoogle: vi
        .fn()
        .mockResolvedValue({ ok: true, account: { name: 'T', email: 't@example.com' } }),
      getCurrentAccount: vi.fn().mockResolvedValue({ name: 'T', email: 't@example.com' }),
    },
    guidedNotes: {
      pickSpreadsheet: vi.fn().mockResolvedValue(makeSpreadsheet()),
      readWorksheet: vi.fn().mockResolvedValue(makeImportSuccess()),
    },
    activity: {
      getCurrentActivity: vi.fn().mockResolvedValue(null),
      createActivity: vi.fn().mockResolvedValue(makeActivity()),
    },
  });
  renderWithRegistry(<AppRouter />, registry);
  return {
    registry,
    choicePrompt,
    openChooser: () =>
      act(() =>
        notify({
          title: '模擬帳號選擇',
          options: [
            { id: 'mock-teacher', label: '模擬老師帳號' },
            { id: 'cancel', label: '取消' },
          ],
        }),
      ),
  };
}

function goBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

const onHome = () => screen.findByRole('button', { name: /我是老師/ });
const onLogin = () => screen.findByRole('button', { name: '用 Google 登入' });
const onJoin = () => screen.findByText('目前沒有活動，請等老師建立活動');

describe('AppRouter browser back (FR-014, US1 AC-7)', () => {
  it('pushes a history entry without changing the URL on every page change', async () => {
    setup();
    await onHome();
    const before = pushState.mock.calls.length;
    const url = window.location.href;
    await userEvent.click(screen.getByRole('button', { name: /我是老師/ }));
    await onLogin();
    expect(pushState.mock.calls.length).toBe(before + 1);
    // No URL argument means the address stays the same.
    expect(pushState.mock.calls.at(-1)?.[2]).toBeUndefined();
    expect(window.location.href).toBe(url);
  });

  it('goes from T-Login back to Main', async () => {
    setup();
    await userEvent.click(await onHome());
    await onLogin();
    goBack();
    await onHome();
  });

  it('goes from S-Join back to Main', async () => {
    setup();
    await onHome();
    await userEvent.click(screen.getByRole('button', { name: /我是學生/ }));
    await onJoin();
    goBack();
    await onHome();
  });

  it('goes from T-Pick back to Main, like its 取消 button', async () => {
    setup();
    await userEvent.click(await onHome());
    await userEvent.click(await onLogin());
    await screen.findByRole('button', { name: '從 Google 雲端硬碟挑選' });
    goBack();
    await onHome();
  });

  it('stays on Main and pushes the entry back (edge)', async () => {
    setup();
    await onHome();
    const before = pushState.mock.calls.length;
    goBack();
    expect(await onHome()).toBeInTheDocument();
    expect(pushState.mock.calls.length).toBe(before + 1);
  });

  it('only closes an open mock chooser and answers it with null (edge)', async () => {
    const { choicePrompt, openChooser } = setup();
    await userEvent.click(await onHome());
    await onLogin();
    openChooser();
    expect(screen.getByRole('dialog', { name: '模擬帳號選擇' })).toBeInTheDocument();
    const before = pushState.mock.calls.length;
    goBack();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(choicePrompt.answer).toHaveBeenCalledWith(null);
    expect(await onLogin()).toBeInTheDocument();
    expect(pushState.mock.calls.length).toBe(before + 1);
  });
});

/** Main → T-Login → T-Pick → T-Import → T-Setup (create) → T-Lobby through the real pages. */
async function toLobby() {
  await userEvent.click(await onHome());
  await userEvent.click(await onLogin());
  await userEvent.click(await screen.findByRole('button', { name: '從 Google 雲端硬碟挑選' }));
  await userEvent.click(await screen.findByRole('button', { name: '確認匯入，下一步' }));
  await userEvent.click(await screen.findByRole('button', { name: '建立活動' }));
  await screen.findByRole('button', { name: '修改設定' });
}

describe('AppRouter browser back on the T-Lobby cancel dialog (FR-014, FR-026)', () => {
  it('only closes the open cancel dialog, like "繼續準備" (edge)', async () => {
    const { registry } = setup();
    await toLobby();
    await userEvent.click(screen.getByRole('button', { name: '取消活動' }));
    expect(screen.getByRole('dialog', { name: /取消活動/ })).toBeInTheDocument();
    const before = pushState.mock.calls.length;
    goBack();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(registry.activity.cancelActivity).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '修改設定' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開放第 1 題' })).toBeInTheDocument();
    expect(pushState.mock.calls.length).toBe(before + 1);
  });
});
