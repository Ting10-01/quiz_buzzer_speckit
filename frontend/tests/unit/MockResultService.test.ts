import { describe, expect, it } from 'vitest';
import { Judgement } from '@quiz-buzzer/shared/entities';
import { MockActivityService } from '../../src/services/mock/MockActivityService';
import { MockGuidedNotesService } from '../../src/services/mock/MockGuidedNotesService';
import { SPREADSHEET_ID } from '../../src/services/mock/MockFixtures';
import { MockResultService } from '../../src/services/mock/MockResultService';
import { MockSession } from '../../src/services/mock/MockSession';
import { MockSubmissionService } from '../../src/services/mock/MockSubmissionService';

async function setup(spreadsheetId: string = SPREADSHEET_ID.GROUP_AND_SINGLE) {
  const session = new MockSession();
  session.onRequest(() => session.answer(spreadsheetId));
  const notes = new MockGuidedNotesService(session);
  const sheet = await notes.pickSpreadsheet();
  await notes.readWorksheet(sheet!.id, sheet!.selectedWorksheet);
  const activity = new MockActivityService(session);
  await activity.createActivity({ groupCount: 6 });
  return {
    session,
    activity,
    submission: new MockSubmissionService(session),
    result: new MockResultService(session),
  };
}

describe('MockResultService (M8)', () => {
  it('writes back 6 cells for the editable template', async () => {
    const { result } = await setup(SPREADSHEET_ID.GROUP_AND_SINGLE);
    await expect(result.writeBack()).resolves.toEqual({ ok: true, cellCount: 6 });
  });

  it('fails to write back the view-only template (edge)', async () => {
    const { result } = await setup(SPREADSHEET_ID.SINGLE_ONLY);
    await expect(result.writeBack()).resolves.toEqual({
      ok: false,
      cellCount: 0,
      failureReason: '沒有編輯權限，無法寫回',
    });
  });

  it('reports the first ACCEPTED submission as winner and behind-first times', async () => {
    const { submission, result } = await setup();
    const list = await submission.listSubmissions(1);
    await submission.judge(1, list[0].groupNumber, Judgement.REJECTED);
    await submission.judge(1, list[1].groupNumber, Judgement.ACCEPTED);
    const q1 = await result.getQuestionResult(1);
    expect(q1.winner?.groupNumber).toBe(list[1].groupNumber);
    expect(q1.submissionCount).toBe(list.length);
    expect(q1.submissions.map((s) => s.groupNumber)).toEqual(list.map((s) => s.groupNumber));
    expect(q1.behindFirstMs).toEqual(list.map((s) => s.elapsedMs - list[0].elapsedMs));
    expect(q1.behindFirstMs[0]).toBe(0);
  });

  it('has no winner while nothing is accepted', async () => {
    const { submission, result } = await setup();
    await submission.listSubmissions(2);
    const q2 = await result.getQuestionResult(2);
    expect(q2.winner).toBeUndefined();
    expect(q2.submissionCount).toBeGreaterThanOrEqual(2);
  });

  it('returns empty results for a question without submissions (edge)', async () => {
    const { submission, result } = await setup();
    await submission.listSubmissions(4);
    await expect(result.getQuestionResult(4)).resolves.toEqual({
      questionNumber: 4,
      winner: undefined,
      submissionCount: 0,
      submissions: [],
      behindFirstMs: [],
    });
  });

  it('returns one result per question in question order', async () => {
    const { result } = await setup();
    const all = await result.getAllResults();
    expect(all.map((r) => r.questionNumber)).toEqual([1, 2, 3, 4]);
  });
});
