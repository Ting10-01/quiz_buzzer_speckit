// ConsolePage: the teacher console. This story adds the T-Lobby view (FR-025);
// T-Live, T-EndConfirm and T-QuestionEnd are added by US3 (T074, T075).
// T-Lobby uses the Activity returned by createActivity / updateSettings and then the
// onActivityChange snapshots; it never calls getCurrentActivity (contract C-1).
// Connected tab counts, offline state and time limits are not shown (SC-004).
import { useEffect, useState } from 'react';
import type { Activity } from '@quiz-buzzer/shared/entities';
import type { Navigate, PageState } from '../../app/AppRouter';
import { ActionBar } from '../../components/ActionBar';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { GroupGrid } from '../../components/GroupGrid';
import { PHASE_LABEL } from '../../components/phaseLabels';
import { questionTypeLabel } from '../../components/questionLabels';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './ConsolePage.module.css';

type ConsolePageState = Extract<PageState, { id: 'T-Lobby' }>;

function emptyGroupsText(activity: Activity) {
  const empty = activity.groups.filter((g) => g.memberCount === 0).map((g) => g.number);
  return empty.length === 0
    ? '每一組都有人加入了。'
    : `還沒有人加入的組別：第 ${empty.join('、')} 組。`;
}

export function ConsolePage({ navigate, page }: { navigate: Navigate; page: ConsolePageState }) {
  const { activity: activityService } = useServiceRegistry();
  const [activity, setActivity] = useState(page.activity);

  // Snapshots replace the displayed activity as a whole (contracts: 老師端的即時更新).
  useEffect(() => activityService.onActivityChange(setActivity), [activityService]);

  return (
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} subtitle="控制台" />
      <main className={styles.main}>
        <div className={styles.intro}>
          <span className={styles.phase}>{PHASE_LABEL[activity.phase]}</span>
          <h1 className={styles.title}>等學生加入</h1>
          <p className={styles.lead}>{emptyGroupsText(activity)}</p>
        </div>

        {/* Gets a message once the console calls services (T074); T-Lobby itself only switches pages. */}
        <ErrorArea />

        <div className={styles.columns}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>各組</h2>
            <GroupGrid groups={activity.groups} />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle} id="lobby-questions">
              這一輪的題目
            </h2>
            <ul aria-labelledby="lobby-questions" className={styles.questions}>
              {activity.questions.map((question) => (
                <li key={question.number}>
                  <span className={styles.questionNumber}>第 {question.number} 題</span>
                  <span className={styles.questionType}>{questionTypeLabel(question)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <ActionBar
          back={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate({ id: 'T-Setup', mode: 'edit', activity })}
            >
              修改設定
            </button>
          }
          primary={
            // Opening question 1 is wired in by US3 (T074).
            <button type="button" className="btn btn-primary">
              開放第 1 題
            </button>
          }
        />
      </main>
    </div>
  );
}
