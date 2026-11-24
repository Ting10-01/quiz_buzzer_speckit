// Renders ConsolePage the way AppRouter does for T-Lobby, T-Live and T-QuestionEnd:
// navigating to one of those re-renders ConsolePage; other pages are only recorded.
import { useState } from 'react';
import type { Mock } from 'vitest';
import type { Navigate, PageState } from '../../src/app/AppRouter';
import { ConsolePage } from '../../src/pages/teacher/ConsolePage';

export type ConsolePageState = Extract<PageState, { id: 'T-Lobby' | 'T-Live' | 'T-QuestionEnd' }>;

const isConsolePage = (page: PageState): page is ConsolePageState =>
  page.id === 'T-Lobby' || page.id === 'T-Live' || page.id === 'T-QuestionEnd';

export function ConsoleHarness({ initial, navigate }: { initial: ConsolePageState; navigate: Mock }) {
  const [page, setPage] = useState<ConsolePageState>(initial);
  const go: Navigate = (next) => {
    navigate(next);
    if (isConsolePage(next)) setPage(next);
  };
  return <ConsolePage key={page.id} navigate={go} page={page} />;
}
