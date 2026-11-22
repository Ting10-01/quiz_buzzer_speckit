// AppRouter: switches pages with React state only, no URL routing (research RD-11).
// Reloading the tab always starts at Main. Pages are added to renderPage() story by story.
import { useState, type ReactNode } from 'react';
import type { Activity, ImportError, ImportSuccess, Spreadsheet, Submission } from '@quiz-buzzer/shared/entities';
import { MockModeBadge } from '../components/MockModeBadge';
import { HomePage } from '../pages/HomePage';
import { JoinPage } from '../pages/student/JoinPage';
import { PickPage } from '../pages/teacher/PickPage';
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
  | { id: 'T-Results' }
  | { id: 'S-Join'; previousGroup?: number }
  | { id: 'S-Wait'; groupNumber: number; activity: Activity }
  | { id: 'S-Answer'; groupNumber: number; activity: Activity }
  | { id: 'S-Submitted'; groupNumber: number; activity: Activity; submission: Submission }
  | { id: 'S-QuestionDone'; groupNumber: number; activity: Activity }
  | { id: 'S-Results'; groupNumber: number };

export type PageId = PageState['id'];

export type Navigate = (page: PageState) => void;

function renderPage(page: PageState, navigate: Navigate): ReactNode {
  switch (page.id) {
    case 'Main':
      return <HomePage navigate={navigate} />;
    case 'T-Login':
      return <TeacherLoginPage navigate={navigate} />;
    case 'T-Pick':
      return <PickPage navigate={navigate} />;
    case 'S-Join':
      return <JoinPage navigate={navigate} previousGroup={page.previousGroup} />;
    default:
      // Remaining pages are wired in by later user story phases (tasks T066, T077, T091).
      return null;
  }
}

export function AppRouter() {
  const [page, setPage] = useState<PageState>({ id: 'Main' });
  const content = renderPage(page, setPage);
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
      <MockModeBadge page={page.id} awaitingJudgement={false} />
    </>
  );
}
