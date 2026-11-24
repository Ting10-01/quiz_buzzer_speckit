// Queries and an AppRouter walk shared by the US3 page tests.
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';
import type { Activity, QuestionResult, Submission } from '@quiz-buzzer/shared/entities';
import { AppRouter } from '../../src/app/AppRouter';
import type { ServiceRegistry } from '../../src/services/ServiceRegistry';
import { createFakeRegistry, renderWithRegistry, type FakeRegistryOverrides } from './createFakeRegistry';
import { makeImportSuccess, makeSpreadsheet } from './fixtures';

/** Button names on the left and right sides of the bottom action bar (RD-09). */
export function actionBarSides(container: HTMLElement) {
  const bar = container.querySelector('[data-action-bar]');
  if (!bar) throw new Error('action bar not found');
  const sides = Array.from(bar.querySelectorAll(':scope > div > div')) as HTMLElement[];
  expect(sides).toHaveLength(2);
  const names = (side: HTMLElement) =>
    within(side)
      .queryAllByRole('button')
      .map((button) => button.textContent);
  return { left: names(sides[0]), right: names(sides[1]) };
}

/** The <dd> right after the <dt> whose text is exactly `label`, inside `scope`. */
export function statValue(label: string, scope: HTMLElement = document.body): HTMLElement {
  const term = Array.from(scope.querySelectorAll('dt')).find(
    (dt) => dt.textContent?.trim() === label,
  );
  const value = term?.nextElementSibling;
  if (!value || value.tagName !== 'DD') throw new Error(`stat "${label}" not found`);
  return value as HTMLElement;
}

/** Data rows (header row excluded) of the table named `name`. */
export function tableRows(name: string, scope: HTMLElement = document.body): HTMLElement[] {
  const table = within(scope).getByRole('table', { name });
  return within(table)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

/** The list item of the list named `listName` whose text contains `text`. */
export function listItem(listName: string, text: string): HTMLElement {
  const item = within(screen.getByRole('list', { name: listName }))
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(text));
  if (!item) throw new Error(`no "${text}" in list "${listName}"`);
  return item;
}

export function goBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

export interface RouterSetup {
  registry: ServiceRegistry;
}

/**
 * Renders AppRouter with a fake registry whose teacher flow reaches T-Live of `opened`.
 * `submissions` is what listSubmissions returns; `results` is what getAllResults returns.
 */
export function setupRouter(
  opened: Activity,
  submissions: Submission[],
  results: QuestionResult[],
  overrides: FakeRegistryOverrides = {},
): RouterSetup {
  const account = { name: 'T', email: 't@example.com' };
  const registry = createFakeRegistry({
    ...overrides,
    auth: {
      signInWithGoogle: vi.fn().mockResolvedValue({ ok: true, account }),
      getCurrentAccount: vi.fn().mockResolvedValue(account),
    },
    guidedNotes: {
      pickSpreadsheet: vi.fn().mockResolvedValue(makeSpreadsheet()),
      readWorksheet: vi.fn().mockResolvedValue(makeImportSuccess()),
    },
    activity: {
      getCurrentActivity: vi.fn().mockResolvedValue(null),
      createActivity: vi.fn().mockResolvedValue({ ...opened, phase: 'PREPARING', currentQuestion: undefined }),
      openQuestion: vi.fn().mockResolvedValue(opened),
      ...overrides.activity,
    },
    submission: {
      listSubmissions: vi.fn().mockResolvedValue(submissions),
      ...overrides.submission,
    },
    result: {
      getAllResults: vi.fn().mockResolvedValue(results),
      ...overrides.result,
    },
  });
  renderWithRegistry(<AppRouter />, registry);
  return { registry };
}

/** Main → T-Login → T-Pick → T-Import → T-Setup → T-Lobby → T-Live through the real pages. */
export async function walkToLive() {
  await userEvent.click(await screen.findByRole('button', { name: /我是老師/ }));
  await userEvent.click(await screen.findByRole('button', { name: '用 Google 登入' }));
  await userEvent.click(await screen.findByRole('button', { name: '從 Google 雲端硬碟挑選' }));
  await userEvent.click(await screen.findByRole('button', { name: '確認匯入，下一步' }));
  await userEvent.click(await screen.findByRole('button', { name: '建立活動' }));
  await userEvent.click(await screen.findByRole('button', { name: '開放第 1 題' }));
  await screen.findByRole('button', { name: '結束這一題' });
}

/** A row's text with its buttons left out, so "不接受" means the judgement, not the button. */
export function textWithoutButtons(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button').forEach((b) => b.remove());
  return clone.textContent ?? '';
}
