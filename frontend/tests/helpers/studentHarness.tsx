// Shared setup for the US4 student page tests.
// StudentHarness renders StudentPlayPage the way AppRouter does for S-Wait, S-Answer,
// S-Submitted and S-QuestionDone: navigating to one of those re-renders StudentPlayPage;
// other pages are only recorded. studentEvents() captures the student subscriptions so a
// test can push phase changes, groupmate submissions and judgements.
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi, type Mock } from 'vitest';
import type { Activity, Submission } from '@quiz-buzzer/shared/entities';
import { AppRouter, type Navigate, type PageState } from '../../src/app/AppRouter';
import { StudentPlayPage } from '../../src/pages/student/StudentPlayPage';
import type { ServiceRegistry } from '../../src/services/ServiceRegistry';
import { createFakeRegistry, renderWithRegistry, type FakeRegistryOverrides } from './createFakeRegistry';

export type StudentPlayState = Extract<
  PageState,
  { id: 'S-Wait' | 'S-Answer' | 'S-Submitted' | 'S-QuestionDone' }
>;

const isPlayPage = (page: PageState): page is StudentPlayState =>
  page.id === 'S-Wait' ||
  page.id === 'S-Answer' ||
  page.id === 'S-Submitted' ||
  page.id === 'S-QuestionDone';

export function StudentHarness({ initial, navigate }: { initial: StudentPlayState; navigate: Mock }) {
  const [page, setPage] = useState<StudentPlayState>(initial);
  const go: Navigate = (next) => {
    navigate(next);
    if (isPlayPage(next)) setPage(next);
  };
  return <StudentPlayPage navigate={go} page={page} />;
}

type Listener<T> = (value: T) => void;

/** A subscription double that keeps its live listeners, so a test can notify them. */
function channel<T>() {
  const listeners = new Set<Listener<T>>();
  const subscribe = vi.fn((listener: Listener<T>) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const emit = (value: T) =>
    act(() => {
      listeners.forEach((listener) => listener(value));
    });
  return { subscribe, emit, listeners };
}

/** Phase, groupmate and judgement subscriptions with emitters (RD-12). */
export function studentEvents() {
  const phase = channel<Activity>();
  const groupSubmitted = channel<Submission>();
  const judgement = channel<Submission>();
  return {
    overrides: {
      activity: { onPhaseChange: phase.subscribe },
      submission: { onGroupSubmitted: groupSubmitted.subscribe, onJudgement: judgement.subscribe },
    },
    phase,
    groupSubmitted,
    judgement,
  };
}

/** Merges the subscription doubles of studentEvents() with per-test overrides. */
export function studentRegistry(
  events: ReturnType<typeof studentEvents>,
  overrides: FakeRegistryOverrides = {},
): ServiceRegistry {
  return createFakeRegistry({
    ...overrides,
    activity: { ...events.overrides.activity, ...overrides.activity },
    submission: { ...events.overrides.submission, ...overrides.submission },
  });
}

export function renderStudentPage(initial: StudentPlayState, registry: ServiceRegistry) {
  const navigate = vi.fn();
  const view = renderWithRegistry(<StudentHarness initial={initial} navigate={navigate} />, registry);
  return { navigate, view };
}

export function renderStudentRouter(registry: ServiceRegistry) {
  return renderWithRegistry(<AppRouter />, registry);
}

/** Main → S-Join → select group n → "加入第 n 組", through the real pages. */
export async function joinFromHome(groupNumber: number) {
  await userEvent.click(await screen.findByRole('button', { name: /我是學生/ }));
  await userEvent.click(await screen.findByRole('radio', { name: new RegExp(`第 ${groupNumber} 組`) }));
  await userEvent.click(screen.getByRole('button', { name: `加入第 ${groupNumber} 組` }));
}
