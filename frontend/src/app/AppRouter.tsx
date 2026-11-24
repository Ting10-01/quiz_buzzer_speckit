// AppRouter: switches pages with React state only, no URL routing (research RD-11).
// Reloading the tab always starts at Main. Pages are added to renderPage() story by story.
// Browser back maps to each page's service-free back button through backTarget() (FR-014).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Activity, ImportError, ImportSuccess, Spreadsheet, Submission } from '@quiz-buzzer/shared/entities';
import { closeTopDialog } from '../components/ConfirmDialog';
import { MockModeBadge } from '../components/MockModeBadge';
import { HomePage } from '../pages/HomePage';
import { JoinPage } from '../pages/student/JoinPage';
import { StudentPlayPage } from '../pages/student/StudentPlayPage';
import { StudentResultsPage } from '../pages/student/StudentResultsPage';
import { ConsolePage } from '../pages/teacher/ConsolePage';
import { ImportPage } from '../pages/teacher/ImportPage';
import { PickPage } from '../pages/teacher/PickPage';
import { SetupPage } from '../pages/teacher/SetupPage';
import { TeacherResultsPage } from '../pages/teacher/TeacherResultsPage';
import { TeacherLoginPage } from '../pages/teacher/TeacherLoginPage';
import styles from './AppRouter.module.css';

/** Every page in the spec page list, with the parameters each one needs. */
export type PageState =
  | { id: 'Main' }
  | { id: 'T-Login' }
  | { id: 'T-Pick' }
  | { id: 'T-Import'; result: ImportSuccess }
  | { id: 'T-ImportError'; spreadsheet: Spreadsheet; error: ImportError }
  | { id: 'T-Setup'; mode: 'create'; result: ImportSuccess }
  | { id: 'T-Setup'; mode: 'edit'; activity: Activity }
  | { id: 'T-Lobby'; activity: Activity }
  | { id: 'T-Live'; activity: Activity }
  | { id: 'T-QuestionEnd'; activity: Activity }
  | { id: 'T-Results'; activity: Activity }
  | { id: 'S-Join'; previousGroup?: number }
  | { id: 'S-Wait'; groupNumber: number; activity: Activity }
  | { id: 'S-Answer'; groupNumber: number; activity: Activity }
  | { id: 'S-Submitted'; groupNumber: number; activity: Activity; submission: Submission }
  | { id: 'S-QuestionDone'; groupNumber: number; activity: Activity }
  | { id: 'S-Results'; groupNumber: number };

export type PageId = PageState['id'];

export type Navigate = (page: PageState) => void;

/**
 * FR-014: where browser back goes, matching the page's back-type button that calls no service.
 * null means the page has no such button and stays put. Later stories add their pages here.
 * Student pages after joining (S-Wait to S-Results) have none: "選錯組別？重新選擇" calls a
 * service, so back stays on them too.
 */
function backTarget(page: PageState): PageState | null {
  switch (page.id) {
    case 'T-Login':
    case 'S-Join':
    case 'T-Pick':
      return { id: 'Main' };
    case 'T-Import':
      return { id: 'T-Pick' };
    case 'T-Setup':
      return page.mode === 'create'
        ? { id: 'T-Import', result: page.result }
        : { id: 'T-Lobby', activity: page.activity };
    default:
      return null;
  }
}

/** Adds a history entry without changing the URL, so browser back stays inside the app. */
function pushHistoryEntry() {
  window.history.pushState(null, '');
}

function renderPage(
  page: PageState,
  navigate: Navigate,
  onAwaitingJudgementChange: (awaiting: boolean) => void,
): ReactNode {
  switch (page.id) {
    case 'Main':
      return <HomePage navigate={navigate} />;
    case 'T-Login':
      return <TeacherLoginPage navigate={navigate} />;
    case 'T-Pick':
      return <PickPage navigate={navigate} />;
    case 'T-Import':
    case 'T-ImportError':
      return <ImportPage navigate={navigate} page={page} />;
    case 'T-Setup':
      return <SetupPage navigate={navigate} page={page} />;
    case 'T-Lobby':
    case 'T-Live':
    case 'T-QuestionEnd':
      return <ConsolePage navigate={navigate} page={page} />;
    case 'T-Results':
      return <TeacherResultsPage navigate={navigate} page={page} />;
    case 'S-Join':
      return <JoinPage navigate={navigate} previousGroup={page.previousGroup} />;
    case 'S-Wait':
    case 'S-Answer':
    case 'S-Submitted':
    case 'S-QuestionDone':
      return (
        <StudentPlayPage
          navigate={navigate}
          page={page}
          onAwaitingJudgementChange={onAwaitingJudgementChange}
        />
      );
    case 'S-Results':
      return <StudentResultsPage page={page} />;
  }
}

export function AppRouter() {
  const [page, setPage] = useState<PageState>({ id: 'Main' });
  // True only while S-Submitted waits for a judgement (FR-061 mock accept / reject controls).
  const [awaitingJudgement, setAwaitingJudgement] = useState(false);

  const navigate = useCallback<Navigate>((next) => {
    pushHistoryEntry();
    setPage(next);
  }, []);

  // The entry for the first page, so back on Main fires popstate instead of leaving the app.
  useEffect(() => {
    pushHistoryEntry();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      // An open dialog or mock chooser is only closed, like its cancel-type control.
      if (closeTopDialog()) {
        pushHistoryEntry();
        return;
      }
      const target = backTarget(page);
      if (target) {
        // The back entry was consumed by the browser; going back adds none.
        setPage(target);
      } else {
        // No back-type button: stay, and restore the consumed entry.
        pushHistoryEntry();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [page]);

  const content = renderPage(page, navigate, setAwaitingJudgement);
  const isStudentPage = page.id.startsWith('S-');

  return (
    <>
      {isStudentPage ? (
        <div className={styles.studentColumn} data-testid="student-column">
          {content}
        </div>
      ) : (
        content
      )}
      <MockModeBadge
        page={page.id}
        awaitingJudgement={page.id === 'S-Submitted' && awaitingJudgement}
      />
    </>
  );
}
