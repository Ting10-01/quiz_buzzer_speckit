// T083: S-Results (FR-058, S9, SC-004).
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionResult } from '@quiz-buzzer/shared/entities';
import { StudentResultsPage } from '../../src/pages/student/StudentResultsPage';
import { createFakeRegistry, renderWithRegistry } from '../helpers/createFakeRegistry';
import { makeQuestionResult, makeSubmission } from '../helpers/fixtures';
import { statValue, tableRows, textWithoutButtons } from '../helpers/pageQueries';

/** Group 2 (this tab) won question 2; question 1 was won by group 3; question 3 had no submissions. */
function results(): QuestionResult[] {
  const q1Winner = makeSubmission({ questionNumber: 1, groupNumber: 3, answers: ['CPU', '作業系統'], rank: 1, judgement: 'ACCEPTED' });
  const q1Mine = makeSubmission({ questionNumber: 1, groupNumber: 2, answers: ['GPU', 'OS'], rank: 2, judgement: 'UNJUDGED' });
  const q2Rejected = makeSubmission({ questionNumber: 2, groupNumber: 4, answers: ['佇列'], rank: 1, judgement: 'REJECTED' });
  const q2Mine = makeSubmission({ questionNumber: 2, groupNumber: 2, answers: ['堆疊'], rank: 2, judgement: 'ACCEPTED' });
  return [
    makeQuestionResult({ questionNumber: 1, winner: q1Winner, submissions: [q1Winner, q1Mine] }),
    makeQuestionResult({ questionNumber: 2, winner: q2Mine, submissions: [q2Rejected, q2Mine] }),
    makeQuestionResult({ questionNumber: 3 }),
  ];
}

function setup(all: QuestionResult[], groupNumber = 2) {
  const registry = createFakeRegistry({ result: { getAllResults: vi.fn().mockResolvedValue(all) } });
  renderWithRegistry(<StudentResultsPage page={{ id: 'S-Results', groupNumber }} />, registry);
  return { registry };
}

describe('StudentResultsPage (S-Results)', () => {
  it('loads all results and shows the questions this group won (FR-058)', async () => {
    const { registry } = setup(results());
    await vi.waitFor(() => expect(statValue('本組搶到')).toHaveTextContent('1 題'));
    expect(registry.result.getAllResults).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('banner')).getByText('第 2 組')).toBeInTheDocument();
  });

  it('shows 0 when this group won nothing (edge, S9)', async () => {
    setup(results(), 5);
    await vi.waitFor(() => expect(statValue('本組搶到')).toHaveTextContent('0 題'));
  });

  it('lists every submission of each question with rank, group, answers and judgement (FR-058)', async () => {
    setup(results());
    const q1 = await screen.findByRole('region', { name: '第 1 題' });
    const rows = tableRows('第 1 題的送出', q1);
    expect(rows).toHaveLength(2);
    expect(textWithoutButtons(rows[0])).toMatch(/1.*第 3 組.*CPU.*作業系統.*已接受/);
    expect(textWithoutButtons(rows[1])).toMatch(/2.*第 2 組.*GPU.*OS.*未判定/);

    const q2 = screen.getByRole('region', { name: '第 2 題' });
    const q2Rows = tableRows('第 2 題的送出', q2);
    expect(textWithoutButtons(q2Rows[0])).toMatch(/1.*第 4 組.*佇列.*不接受/);
    expect(textWithoutButtons(q2Rows[1])).toMatch(/2.*第 2 組.*堆疊.*已接受/);
  });

  it('says so for a question nobody submitted (edge)', async () => {
    setup(results());
    const q3 = await screen.findByRole('region', { name: '第 3 題' });
    expect(q3).toHaveTextContent('沒有組別送出');
    expect(within(q3).queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers no buttons and no "開新一輪" (FR-058, SC-004)', async () => {
    setup(results());
    await screen.findByRole('region', { name: '第 1 題' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/開新一輪/)).not.toBeInTheDocument();
  });

  it('shows an unexpected error from getAllResults in the error area (FR-009)', async () => {
    const registry = createFakeRegistry({
      result: { getAllResults: vi.fn().mockRejectedValue({ message: '模擬：連不上伺服器' }) },
    });
    renderWithRegistry(<StudentResultsPage page={{ id: 'S-Results', groupNumber: 2 }} />, registry);
    expect(await screen.findByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
  });
});
