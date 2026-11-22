// Mock control bar (FR-061, contracts/mock-controls.md). Shows only the controls available on
// the current page whose ServiceRegistry field exists, and displays mock choosers (M1, M2).
import { useCallback, useEffect, useState } from 'react';
import { Judgement } from '@quiz-buzzer/shared/entities';
import type { PageId } from '../app/AppRouter';
import type { ChoiceRequest } from '../services/interfaces';
import { useServiceRegistry } from '../services/ServiceRegistryContext';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './MockControlBar.module.css';

const ADVANCE_PAGES: readonly PageId[] = [
  'Main',
  'S-Join',
  'S-Wait',
  'S-Answer',
  'S-Submitted',
  'S-QuestionDone',
];

const UNEXPECTED_ERROR_PAGES: readonly PageId[] = [
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

/** How long the armed hint stays visible (FR-061: "數秒後"). */
const HINT_DURATION_MS = 3000;

const VALIDATION_HINT = '已設定：下一次送出會回傳驗證錯誤';
const UNEXPECTED_HINT = '已設定：下一次介面呼叫會回傳非預期錯誤';

interface Control {
  label: string;
  run: () => void;
}

interface MockControlBarProps {
  page: PageId;
  /** True only while S-Submitted is waiting for a judgement. */
  awaitingJudgement: boolean;
}

function ignore() {
  // Control failures have nowhere to be shown; the page state stays unchanged.
}

export function MockControlBar({ page, awaitingJudgement }: MockControlBarProps) {
  const registry = useServiceRegistry();
  const { phaseControl, judgementControl, teammateControl, unexpectedErrorControl, choicePrompt } =
    registry;
  const [request, setRequest] = useState<ChoiceRequest | null>(null);
  // The hint only confirms the click; it does not track whether the error was consumed.
  // It belongs to the page it was set on, so changing pages hides it immediately.
  const [hint, setHint] = useState<{ text: string; page: PageId }>();
  const showHint = (text: string) => setHint({ text, page });

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(undefined), HINT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [hint]);
  // Drop a hint from another page so returning to its page does not bring it back.
  if (hint && hint.page !== page) setHint(undefined);
  const visibleHint = hint?.page === page ? hint.text : undefined;

  useEffect(() => choicePrompt?.onRequest(setRequest), [choicePrompt]);

  const answer = useCallback(
    (choiceId: string | null) => {
      setRequest(null);
      choicePrompt?.answer(choiceId);
    },
    [choicePrompt],
  );
  const close = useCallback(() => answer(null), [answer]);

  const controls: Control[] = [];
  if (phaseControl && ADVANCE_PAGES.includes(page)) {
    controls.push({
      label: '模擬：推進到下一個階段',
      run: () => void phaseControl.advancePhase().catch(ignore),
    });
  }
  if (judgementControl && page === 'S-Submitted' && awaitingJudgement) {
    controls.push(
      {
        label: '模擬：接受',
        run: () => void judgementControl.simulateJudgement(Judgement.ACCEPTED).catch(ignore),
      },
      {
        label: '模擬：不接受',
        run: () => void judgementControl.simulateJudgement(Judgement.REJECTED).catch(ignore),
      },
    );
  }
  if (teammateControl && page === 'S-Answer') {
    controls.push({
      label: '模擬：同組組員送出',
      run: () => void teammateControl.simulateTeammateSubmission().catch(ignore),
    });
  }
  const validationControl =
    page === 'T-Setup'
      ? registry.activityValidationControl
      : page === 'S-Answer'
        ? registry.submissionValidationControl
        : undefined;
  if (validationControl) {
    controls.push({
      label: '模擬：驗證失敗',
      run: () => {
        validationControl.failNextValidation();
        showHint(VALIDATION_HINT);
      },
    });
  }
  if (unexpectedErrorControl && UNEXPECTED_ERROR_PAGES.includes(page)) {
    controls.push({
      label: '模擬：非預期錯誤',
      run: () => {
        unexpectedErrorControl.failNextCall();
        showHint(UNEXPECTED_HINT);
      },
    });
  }

  return (
    <>
      {controls.length > 0 && (
        <div className={styles.bar} role="group" aria-label="模擬控制列">
          {controls.map((control) => (
            <button
              key={control.label}
              type="button"
              className={styles.control}
              onClick={control.run}
            >
              {control.label}
            </button>
          ))}
          {visibleHint && (
            <span className={styles.hint} role="status">
              {visibleHint}
            </span>
          )}
        </div>
      )}
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ''}
        onClose={close}
        actions={(request?.options ?? []).map((option) => ({
          label: option.label,
          onClick: () => answer(option.id),
        }))}
      />
    </>
  );
}
