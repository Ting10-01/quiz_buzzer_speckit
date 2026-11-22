import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageId } from '../../src/app/AppRouter';
import { MockControlBar } from '../../src/components/MockControlBar';
import { MockModeBadge } from '../../src/components/MockModeBadge';
import type { ChoiceRequest } from '../../src/services/interfaces';
import { ServiceRegistryProvider } from '../../src/services/ServiceRegistryContext';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';

const ALL_PAGES: PageId[] = [
  'Main',
  'T-Login',
  'T-Pick',
  'T-Import',
  'T-ImportError',
  'T-Setup',
  'T-Lobby',
  'T-Live',
  'T-QuestionEnd',
  'T-Results',
  'S-Join',
  'S-Wait',
  'S-Answer',
  'S-Submitted',
  'S-QuestionDone',
  'S-Results',
];

const ADVANCE = ['Main', 'S-Join', 'S-Wait', 'S-Answer', 'S-Submitted', 'S-QuestionDone'];
const VALIDATION = ['T-Setup', 'S-Answer'];
const UNEXPECTED = [
  'T-Login',
  'T-Pick',
  'T-Import',
  'T-ImportError',
  'T-Setup',
  'T-Lobby',
  'T-Live',
  'T-QuestionEnd',
  'T-Results',
  'S-Join',
  'S-Wait',
  'S-Answer',
];

function fullControls() {
  return {
    phaseControl: { advancePhase: vi.fn(() => new Promise<never>(() => {})) },
    judgementControl: { simulateJudgement: vi.fn(() => new Promise<never>(() => {})) },
    activityValidationControl: { failNextValidation: vi.fn() },
    submissionValidationControl: { failNextValidation: vi.fn() },
    unexpectedErrorControl: { failNextCall: vi.fn() },
  };
}

function labels() {
  return screen.queryAllByRole('button').map((b) => b.textContent);
}

describe('MockControlBar (FR-061)', () => {
  it.each(ALL_PAGES)('shows only the controls allowed on %s', (page) => {
    renderWithRegistry(
      <MockControlBar page={page} awaitingJudgement />,
      createFakeRegistry(fullControls()),
    );
    const expected: string[] = [];
    if (ADVANCE.includes(page)) expected.push('模擬：推進到下一個階段');
    if (page === 'S-Submitted') expected.push('模擬：接受', '模擬：不接受');
    if (VALIDATION.includes(page)) expected.push('模擬：驗證失敗');
    if (UNEXPECTED.includes(page)) expected.push('模擬：非預期錯誤');
    expect(labels()).toEqual(expected);
  });

  it('hides accept/reject on S-Submitted unless awaiting judgement', () => {
    renderWithRegistry(
      <MockControlBar page="S-Submitted" awaitingJudgement={false} />,
      createFakeRegistry(fullControls()),
    );
    expect(labels()).toEqual(['模擬：推進到下一個階段']);
  });

  it('calls the matching control', async () => {
    const controls = fullControls();
    const { unmount } = renderWithRegistry(
      <MockControlBar page="S-Submitted" awaitingJudgement />,
      createFakeRegistry(controls),
    );
    await userEvent.click(screen.getByRole('button', { name: '模擬：推進到下一個階段' }));
    await userEvent.click(screen.getByRole('button', { name: '模擬：接受' }));
    await userEvent.click(screen.getByRole('button', { name: '模擬：不接受' }));
    expect(controls.phaseControl.advancePhase).toHaveBeenCalledTimes(1);
    expect(controls.judgementControl.simulateJudgement.mock.calls).toEqual([
      ['ACCEPTED'],
      ['REJECTED'],
    ]);
    unmount();

    renderWithRegistry(<MockControlBar page="T-Setup" awaitingJudgement={false} />, createFakeRegistry(controls));
    await userEvent.click(screen.getByRole('button', { name: '模擬：驗證失敗' }));
    await userEvent.click(screen.getByRole('button', { name: '模擬：非預期錯誤' }));
    expect(controls.activityValidationControl.failNextValidation).toHaveBeenCalledTimes(1);
    expect(controls.submissionValidationControl.failNextValidation).not.toHaveBeenCalled();
    expect(controls.unexpectedErrorControl.failNextCall).toHaveBeenCalledTimes(1);
  });

  it('uses the submission validation control on S-Answer', async () => {
    const controls = fullControls();
    renderWithRegistry(<MockControlBar page="S-Answer" awaitingJudgement={false} />, createFakeRegistry(controls));
    await userEvent.click(screen.getByRole('button', { name: '模擬：驗證失敗' }));
    expect(controls.submissionValidationControl.failNextValidation).toHaveBeenCalledTimes(1);
    expect(controls.activityValidationControl.failNextValidation).not.toHaveBeenCalled();
  });

  describe('armed hint (FR-061, US5 AC-11)', () => {
    const VALIDATION_HINT = '已設定：下一次送出會回傳驗證錯誤';
    const UNEXPECTED_HINT = '已設定：下一次介面呼叫會回傳非預期錯誤';

    afterEach(() => {
      vi.useRealTimers();
    });

    function renderBar(page: PageId) {
      const registry = createFakeRegistry(fullControls());
      const result = renderWithRegistry(<MockControlBar page={page} awaitingJudgement />, registry);
      const rerenderPage = (next: PageId) =>
        result.rerender(
          <ServiceRegistryProvider registry={registry}>
            <MockControlBar page={next} awaitingJudgement />
          </ServiceRegistryProvider>,
        );
      return { rerenderPage };
    }

    it.each([
      ['模擬：驗證失敗', VALIDATION_HINT],
      ['模擬：非預期錯誤', UNEXPECTED_HINT],
    ])('shows a hint after clicking %s and hides it after a few seconds', (label, hint) => {
      vi.useFakeTimers();
      renderBar('S-Answer');
      expect(screen.queryByText(hint)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByRole('status')).toHaveTextContent(hint);
      act(() => vi.advanceTimersByTime(10_000));
      expect(screen.queryByText(hint)).not.toBeInTheDocument();
    });

    it('hides the hint immediately when the page changes (edge)', async () => {
      const { rerenderPage } = renderBar('T-Setup');
      await userEvent.click(screen.getByRole('button', { name: '模擬：非預期錯誤' }));
      expect(screen.getByText(UNEXPECTED_HINT)).toBeInTheDocument();
      rerenderPage('T-Lobby');
      expect(screen.queryByText(UNEXPECTED_HINT)).not.toBeInTheDocument();
      rerenderPage('T-Setup');
      expect(screen.queryByText(UNEXPECTED_HINT)).not.toBeInTheDocument();
    });

    it('shows no hint for advance, accept or reject (edge)', async () => {
      renderBar('S-Submitted');
      for (const label of ['模擬：推進到下一個階段', '模擬：接受', '模擬：不接受']) {
        await userEvent.click(screen.getByRole('button', { name: label }));
      }
      expect(screen.queryByText(/^已設定/)).not.toBeInTheDocument();
    });
  });

  it('hides controls whose registry field is undefined (edge)', () => {
    for (const page of ALL_PAGES) {
      const { unmount } = renderWithRegistry(
        <MockControlBar page={page} awaitingJudgement />,
        createFakeRegistry(),
      );
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      unmount();
    }
  });

  it('shows a choice request as a dialog and answers it', async () => {
    let notify: (request: ChoiceRequest) => void = () => {};
    const choicePrompt = {
      onRequest: vi.fn((listener: (request: ChoiceRequest) => void) => {
        notify = listener;
        return vi.fn();
      }),
      answer: vi.fn(),
    };
    renderWithRegistry(<MockControlBar page="T-Login" awaitingJudgement={false} />, createFakeRegistry({ choicePrompt }));
    act(() =>
      notify({
        title: '模擬帳號選擇',
        options: [
          { id: 'mock-teacher', label: '模擬老師帳號' },
          { id: 'cancel', label: '取消' },
        ],
      }),
    );
    const dialog = screen.getByRole('dialog', { name: '模擬帳號選擇' });
    await userEvent.click(within(dialog).getByRole('button', { name: '模擬老師帳號' }));
    expect(choicePrompt.answer).toHaveBeenCalledWith('mock-teacher');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => notify({ title: '模擬檔案選擇器', options: [{ id: 'a', label: 'A' }] }));
    await userEvent.keyboard('{Escape}');
    expect(choicePrompt.answer).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('unsubscribes from choice requests on unmount', () => {
    const unsubscribe = vi.fn();
    const choicePrompt = { onRequest: vi.fn(() => unsubscribe), answer: vi.fn() };
    const { unmount } = renderWithRegistry(
      <MockControlBar page="Main" awaitingJudgement={false} />,
      createFakeRegistry({ choicePrompt }),
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('MockModeBadge (FR-005, SC-003)', () => {
  it('shows "模擬模式" with the control bar in mock mode', () => {
    renderWithRegistry(
      <MockModeBadge page="Main" awaitingJudgement={false} />,
      createFakeRegistry({ ...fullControls(), isMockMode: true }),
    );
    expect(screen.getByText('模擬模式')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '模擬控制列' })).toBeInTheDocument();
  });

  it('renders neither badge nor controls when not in mock mode (edge)', () => {
    const { container } = renderWithRegistry(
      <MockModeBadge page="Main" awaitingJudgement={false} />,
      createFakeRegistry({ ...fullControls(), isMockMode: false }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
