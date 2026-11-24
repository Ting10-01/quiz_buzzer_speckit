// T-Import / T-ImportError: one page, the `page` prop decides which view is shown.
// T-Import shows the recognition result (FR-021); T-ImportError shows why no header was found (FR-022).
// "連結 Google 帳號" / "解除連結" from the T-Import design are removed (SC-004).
import { useState } from 'react';
import { QuestionType, type ImportError, type ImportSuccess, type Spreadsheet } from '@quiz-buzzer/shared/entities';
import type { Navigate, PageState } from '../../app/AppRouter';
import { ActionBar } from '../../components/ActionBar';
import { AppHeader } from '../../components/AppHeader';
import { ErrorArea } from '../../components/ErrorArea';
import { errorMessage } from '../../components/errorMessage';
import { blankCellsLabel, questionTypeLabel } from '../../components/questionLabels';
import { SheetPreview } from '../../components/SheetPreview';
import { useServiceRegistry } from '../../services/ServiceRegistryContext';
import { pickToPage, readToPage } from './importNavigation';
import styles from './ImportPage.module.css';

type ImportPageState = Extract<PageState, { id: 'T-Import' } | { id: 'T-ImportError' }>;

interface ImportPageProps {
  navigate: Navigate;
  page: ImportPageState;
}

export function ImportPage({ navigate, page }: ImportPageProps) {
  const { guidedNotes } = useServiceRegistry();
  const [error, setError] = useState<string>();

  /** Runs a pick or read; a page result navigates, null (closed picker) stays. */
  const run = async (action: () => Promise<PageState | null>) => {
    try {
      const next = await action();
      setError(undefined);
      if (next) navigate(next);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  const repick = () => void run(() => pickToPage(guidedNotes));

  return (
    <div className={styles.page}>
      <AppHeader variant="teacher" onHome={() => navigate({ id: 'Main' })} subtitle="建立活動" />
      <main className={styles.main}>
        <ErrorArea message={error} />
        {page.id === 'T-Import' ? (
          <ImportResult
            result={page.result}
            onSelectWorksheet={(worksheet) =>
              void run(() => readToPage(guidedNotes, page.result.spreadsheet, worksheet))
            }
            onRepick={repick}
            onCancel={() => navigate({ id: 'T-Pick' })}
            onConfirm={() => navigate({ id: 'T-Setup', mode: 'create', result: page.result })}
          />
        ) : (
          <ImportFailure
            spreadsheet={page.spreadsheet}
            error={page.error}
            onRepick={repick}
            onReread={() =>
              void run(() =>
                readToPage(guidedNotes, page.spreadsheet, page.spreadsheet.selectedWorksheet),
              )
            }
          />
        )}
      </main>
    </div>
  );
}

interface ImportResultProps {
  result: ImportSuccess;
  onSelectWorksheet: (worksheet: string) => void;
  onRepick: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function ImportResult({ result, onSelectWorksheet, onRepick, onCancel, onConfirm }: ImportResultProps) {
  const { spreadsheet, questions } = result;
  const groupCount = questions.filter((q) => q.type === QuestionType.GROUP).length;
  const blankCount = questions.reduce((sum, q) => sum + q.subQuestions.length, 0);

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>確認辨識結果</h1>
        <p className={styles.lead}>
          表頭在「{spreadsheet.selectedWorksheet}」工作表第 {result.headerRow} 列，
          題號、題目、作答依序在 {result.headerColumns.join('、')} 欄。
        </p>
      </div>

      <div className={styles.columns}>
        <section className={styles.card}>
          <div className={styles.sheetHead}>
            <div className={styles.sheetTitle}>
              <h2 className={styles.cardTitle}>{spreadsheet.title}</h2>
              <span className={spreadsheet.editable ? styles.editable : styles.readOnly}>
                {spreadsheet.editable ? '可編輯' : '僅檢視'}
              </span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onRepick}>
              重新挑選
            </button>
          </div>
          <div role="tablist" aria-label="工作表" className={styles.tabs}>
            {spreadsheet.worksheets.map((worksheet) => {
              const selected = worksheet === spreadsheet.selectedWorksheet;
              return (
                <button
                  key={worksheet}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={styles.tab}
                  onClick={() => {
                    if (!selected) onSelectWorksheet(worksheet);
                  }}
                >
                  {worksheet}
                </button>
              );
            })}
          </div>
          <SheetPreview result={result} />
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>辨識出的題目</h2>
          <dl className={styles.stats}>
            <div>
              <dt>題數</dt>
              <dd>{questions.length}</dd>
            </div>
            <div>
              <dt>題組數</dt>
              <dd>{groupCount}</dd>
            </div>
            <div>
              <dt>填空格數</dt>
              <dd>{blankCount}</dd>
            </div>
          </dl>
          <table className={styles.questions}>
            <thead>
              <tr>
                <th scope="col">題號</th>
                <th scope="col">類型</th>
                <th scope="col">填空格</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.number}>
                  <th scope="row">第 {question.number} 題</th>
                  <td>{questionTypeLabel(question)}</td>
                  <td>{blankCellsLabel(question)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <ActionBar
        back={
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        }
        primary={
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            確認匯入，下一步
          </button>
        }
      />
    </>
  );
}

interface ImportFailureProps {
  spreadsheet: Spreadsheet;
  error: ImportError;
  onRepick: () => void;
  onReread: () => void;
}

function ImportFailure({ spreadsheet, error, onRepick, onReread }: ImportFailureProps) {
  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>找不到表頭，無法匯入</h1>
        <p className={styles.lead}>
          {spreadsheet.title} · 工作表「{spreadsheet.selectedWorksheet}」
        </p>
      </div>

      <div className={styles.columns}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>錯誤原因</h2>
          <p>{error.reason}</p>
          <h3 className={styles.subTitle}>學習單目前的表頭</h3>
          <ul className={styles.foundHeaders}>
            {error.foundHeaders.map((header) => (
              <li key={header}>{header}</li>
            ))}
          </ul>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>系統認得的表頭寫法</h2>
          <ul className={styles.list}>
            {error.acceptedHeaders.map((header) => (
              <li key={header}>{header}</li>
            ))}
          </ul>
          <h2 className={styles.cardTitle}>怎麼修正</h2>
          <ol className={styles.list}>
            {error.fixSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </div>

      <ActionBar
        back={
          <button type="button" className="btn btn-secondary" onClick={onRepick}>
            重新挑選
          </button>
        }
        primary={
          <button type="button" className="btn btn-primary" onClick={onReread}>
            重新讀取
          </button>
        }
      />
    </>
  );
}
