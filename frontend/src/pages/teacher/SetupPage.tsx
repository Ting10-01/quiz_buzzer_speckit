// T-Setup: group count and the round summary, in create or edit mode (FR-023, FR-024).
// No activity name, fair mode, time limit or student join URL (SC-004).
// Group count range, default and the join text come from 004's activityRules (D4, D5, 004 C2);
// "−" and "+" stop at the range, and the activity service still validates the count (FR-008).
import { useState } from 'react';
import { QuestionType, type ActivitySettings } from '@quiz-buzzer/shared/entities';
import {
  GROUP_COUNT_DEFAULT,
  GROUP_COUNT_MAX,
  GROUP_COUNT_MIN,
  JOIN_METHOD_TEXT,
} from '@quiz-buzzer/shared/activityRules';
import { isValidationError } from '@quiz-buzzer/shared/guards';
import type { Navigate, PageState } from '../../app/AppRouter';
import { ActionBar } from '../../components/ActionBar';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './SetupPage.module.css';

type SetupPageState = Extract<PageState, { id: 'T-Setup' }>;

/** Success rule from docs/feature-split.md 3.2 and section 4, not the design's rule text (FR-023, D18). */
const SUCCESS_RULE =
  '老師依送出順序判定，第一個被接受的組別搶答成功，這一題隨即結束；老師只能判定最早一筆還沒判定的答案。每組每題只能送出一次，被拒絕後不能重送。';

export function SetupPage({ navigate, page }: { navigate: Navigate; page: SetupPageState }) {
  const { activity: activityService } = useServiceRegistry();
  const [groupCount, setGroupCount] = useState(
    page.mode === 'edit' ? page.activity.groupCount : GROUP_COUNT_DEFAULT,
  );
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();

  const questions = page.mode === 'edit' ? page.activity.questions : page.result.questions;
  const groupQuestionNumbers = questions
    .filter((q) => q.type === QuestionType.GROUP)
    .map((q) => q.number);

  const save = async () => {
    const settings: ActivitySettings = { groupCount };
    try {
      const result =
        page.mode === 'create'
          ? await activityService.createActivity(settings)
          : await activityService.updateSettings(settings);
      setError(undefined);
      if (isValidationError(result)) {
        // Group count is the only field, so every validation message belongs beside it (FR-008).
        setFieldError(result.message);
        return;
      }
      navigate({ id: 'T-Lobby', activity: result });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <div className={styles.page}>
      <AppHeader
        variant="teacher"
        onHome={() => navigate({ id: 'Main' })}
        subtitle={page.mode === 'create' ? '建立活動' : '修改設定'}
      />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>活動設定</h1>
          <p className={styles.lead}>
            {page.mode === 'create'
              ? '設定好組數就能建立活動。建立後學生可以開始加入；你開放第 1 題後才能作答。'
              : '修改組數後按「儲存設定」。'}
          </p>
        </div>

        <ErrorArea message={error} />

        <div className={styles.columns}>
          <section className={styles.card}>
            <fieldset className={styles.field} aria-describedby={fieldError ? 'group-count-error' : undefined}>
              <legend className={styles.legend}>組數</legend>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.step}
                  disabled={groupCount <= GROUP_COUNT_MIN}
                  onClick={() => setGroupCount((n) => Math.max(GROUP_COUNT_MIN, n - 1))}
                >
                  −
                </button>
                <span className={styles.count}>{groupCount} 組</span>
                <button
                  type="button"
                  className={styles.step}
                  disabled={groupCount >= GROUP_COUNT_MAX}
                  onClick={() => setGroupCount((n) => Math.min(GROUP_COUNT_MAX, n + 1))}
                >
                  +
                </button>
              </div>
              <ul className={styles.groups}>
                {Array.from({ length: groupCount }, (_, i) => (
                  <li key={i}>第 {i + 1} 組</li>
                ))}
              </ul>
              {fieldError && (
                <p id="group-count-error" className={styles.fieldError}>
                  {fieldError}
                </p>
              )}
            </fieldset>
          </section>

          <section aria-label="這一輪" className={styles.card}>
            <h2 className={styles.cardTitle}>這一輪</h2>
            <dl className={styles.summary}>
              <dt>題數</dt>
              <dd>{questions.length} 題</dd>
              <dt>題組</dt>
              <dd>
                {groupQuestionNumbers.length > 0
                  ? `第 ${groupQuestionNumbers.join('、')} 題`
                  : '沒有題組'}
              </dd>
              <dt>組數</dt>
              <dd>{groupCount} 組</dd>
              <dt>成功規則</dt>
              <dd>{SUCCESS_RULE}</dd>
              <dt>學生加入</dt>
              <dd>{JOIN_METHOD_TEXT}</dd>
            </dl>
          </section>
        </div>

        <ActionBar
          back={
            page.mode === 'create' ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate({ id: 'T-Import', result: page.result })}
              >
                上一步
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate({ id: 'T-Lobby', activity: page.activity })}
              >
                取消
              </button>
            )
          }
          primary={
            <button type="button" className="btn btn-primary" onClick={() => void save()}>
              {page.mode === 'create' ? '建立活動' : '儲存設定'}
            </button>
          }
        />
      </main>
    </div>
  );
}
