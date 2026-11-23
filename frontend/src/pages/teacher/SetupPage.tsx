// T-Setup: group count and the round summary, in create or edit mode (FR-023, FR-024).
// No activity name, fair mode, time limit or student join URL (SC-004).
// Group count range and default belong to 004 (D4, D5); "−" and "+" only change the entered value.
import { useState } from 'react';
import { QuestionType, type ActivitySettings } from '@quiz-buzzer/shared/entities';
import { isUnexpectedError, isValidationError } from '@quiz-buzzer/shared/guards';
import type { Navigate, PageState } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import styles from './SetupPage.module.css';

type SetupPageState = Extract<PageState, { id: 'T-Setup' }>;

/** Starting value in create mode, for display only; the real default is decided by 004 (D5). */
const INITIAL_GROUP_COUNT = 6;

/** Rule texts follow docs/feature-split.md 3.2, not the design's rule text (FR-023). */
const SUCCESS_RULE =
  '老師依送出順序判定，只能判定最早一筆還沒判定的答案；第一個被接受的組別搶答成功，這一題隨即結束。每組每題只能送出一次。';
const JOIN_METHOD = '學生在首頁選「我是學生」，再選自己的組別加入。同一組可以有多位同學，任何人送出都代表整組。';

export function SetupPage({ navigate, page }: { navigate: Navigate; page: SetupPageState }) {
  const { activity: activityService } = useServiceRegistry();
  const [groupCount, setGroupCount] = useState(
    page.mode === 'edit' ? page.activity.groupCount : INITIAL_GROUP_COUNT,
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
      setError(isUnexpectedError(reason) ? reason.message : String(reason));
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
                  onClick={() => setGroupCount((n) => Math.max(0, n - 1))}
                >
                  −
                </button>
                <span className={styles.count}>{groupCount} 組</span>
                <button type="button" className={styles.step} onClick={() => setGroupCount((n) => n + 1)}>
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
              <dd>{JOIN_METHOD}</dd>
            </dl>
          </section>
        </div>

        <div className={styles.actions}>
          {page.mode === 'create' ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate({ id: 'T-Import', result: page.result })}
              >
                上一步
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                建立活動
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate({ id: 'T-Lobby', activity: page.activity })}
              >
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                儲存設定
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
