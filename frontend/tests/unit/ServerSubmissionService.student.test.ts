import type { Submission } from '@quiz-buzzer/shared/entities';
import { GROUP_SUBMITTED, JUDGED, OWN, SUBMIT, type SubmitRequest } from '@quiz-buzzer/shared/submissionEvents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerSubmissionService } from '../../src/services/server/ServerSubmissionService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeSubmission } from '../helpers/fixtures';

// T014: the student methods of ServerSubmissionService over 004's RealtimeClient
// (contracts/submission-api.md sections 1–2, research RD-04, RD-08); AC-05, AC-27, AC-28.
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';

let realtime: FakeRealtimeClient;
let api: { request: ReturnType<typeof vi.fn> };
let service: ServerSubmissionService;

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  api = { request: vi.fn() };
  service = new ServerSubmissionService(realtime as never, api as never);
});

function studentView(overrides: Partial<Submission> = {}): Submission {
  return makeSubmission({ questionNumber: 2, groupNumber: 1, answers: ['光合作用'], rank: 0, judgement: 'PENDING', ...overrides });
}

/** The requests sent with this event so far. */
function sent(event: string): SubmitRequest[] {
  return realtime.emitWithAck.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload as SubmitRequest);
}

/** Lets resolved promises and their callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ServerSubmissionService.submitAnswer', () => {
  it('sends submission:submit with the question, the answers and a requestId, and answers the Submission when ok', async () => {
    const submission = studentView();
    realtime.emitWithAck.mockResolvedValue({ ok: true, submission });

    await expect(service.submitAnswer(2, ['光合作用'])).resolves.toEqual(submission);
    expect(sent(SUBMIT)).toEqual([{ questionNumber: 2, answers: ['光合作用'], requestId: expect.any(String) }]);
    expect(sent(SUBMIT)[0].requestId).not.toBe('');
  });

  it('answers the ValidationError when not ok', async () => {
    const error = { field: 'answers.0', message: '每一格都填才能送出' };
    realtime.emitWithAck.mockResolvedValue({ ok: false, error });
    await expect(service.submitAnswer(2, [' '])).resolves.toEqual(error);
  });

  it('answers the same Promise and emits once while a submission of the question is in flight (AC-05)', async () => {
    let answer!: (reply: unknown) => void;
    realtime.emitWithAck.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const first = service.submitAnswer(2, ['光合作用']);
    const second = service.submitAnswer(2, ['光合作用']);
    expect(second).toBe(first);
    expect(sent(SUBMIT)).toHaveLength(1);

    answer({ ok: true, submission: studentView() });
    await expect(first).resolves.toEqual(studentView());
  });

  it('sends again once the earlier submission has answered', async () => {
    realtime.emitWithAck.mockResolvedValue({ ok: false, error: { field: 'answers.0', message: '每一格都填才能送出' } });
    await service.submitAnswer(2, [' ']);
    await service.submitAnswer(2, ['光合作用']);
    expect(sent(SUBMIT)).toHaveLength(2);
  });

  it('rejects with the same error when emitWithAck times out', async () => {
    const timeout = new Error(SERVER_UNREACHABLE);
    realtime.emitWithAck.mockRejectedValue(timeout);
    await expect(service.submitAnswer(2, ['光合作用'])).rejects.toBe(timeout);
  });

  it('reuses the requestId when the same question and answers are sent again after a timeout (research RD-04)', async () => {
    realtime.emitWithAck.mockRejectedValueOnce(new Error(SERVER_UNREACHABLE));
    await service.submitAnswer(2, ['光合作用']).catch(() => {});
    realtime.emitWithAck.mockResolvedValueOnce({ ok: true, submission: studentView() });
    await service.submitAnswer(2, ['光合作用']);

    const [first, again] = sent(SUBMIT);
    expect(again.requestId).toBe(first.requestId);
  });

  it('uses a new requestId when the answers changed after a timeout', async () => {
    realtime.emitWithAck.mockRejectedValueOnce(new Error(SERVER_UNREACHABLE));
    await service.submitAnswer(2, ['光合作用']).catch(() => {});
    realtime.emitWithAck.mockResolvedValueOnce({ ok: true, submission: studentView() });
    await service.submitAnswer(2, ['呼吸作用']);

    const [first, again] = sent(SUBMIT);
    expect(again.requestId).not.toBe(first.requestId);
  });
});

describe('ServerSubmissionService.getGroupSubmission', () => {
  it('sends submission:own with the question and answers the group’s submission', async () => {
    const submission = studentView();
    realtime.emitWithAck.mockResolvedValue({ submission });
    await expect(service.getGroupSubmission(2)).resolves.toEqual(submission);
    expect(realtime.emitWithAck).toHaveBeenCalledWith(OWN, { questionNumber: 2 });
  });

  it('answers null when the group has not submitted', async () => {
    realtime.emitWithAck.mockResolvedValue({ submission: null });
    await expect(service.getGroupSubmission(2)).resolves.toBeNull();
  });
});

describe('ServerSubmissionService.onGroupSubmitted and onJudgement', () => {
  it('hands submission:groupSubmitted to onGroupSubmitted (AC-27)', () => {
    const listener = vi.fn();
    service.onGroupSubmitted(listener);
    realtime.emit(GROUP_SUBMITTED, { submission: studentView() });
    expect(listener).toHaveBeenCalledExactlyOnceWith(studentView());
  });

  it('hands submission:judged to onJudgement', () => {
    const listener = vi.fn();
    service.onJudgement(listener);
    realtime.emit(JUDGED, { submission: studentView({ judgement: 'REJECTED' }) });
    expect(listener).toHaveBeenCalledExactlyOnceWith(studentView({ judgement: 'REJECTED' }));
  });

  it('stops after unsubscribing', () => {
    const submitted = vi.fn();
    const judged = vi.fn();
    service.onGroupSubmitted(submitted)();
    service.onJudgement(judged)();
    realtime.emit(GROUP_SUBMITTED, { submission: studentView() });
    realtime.emit(JUDGED, { submission: studentView({ judgement: 'REJECTED' }) });
    expect(submitted).not.toHaveBeenCalled();
    expect(judged).not.toHaveBeenCalled();
  });
});

describe('ServerSubmissionService after reconnecting (research RD-08, AC-28)', () => {
  it('asks submission:own for the last question again and tells onGroupSubmitted when the group has submitted', async () => {
    realtime.emitWithAck.mockResolvedValue({ submission: null });
    await service.getGroupSubmission(3);
    const listener = vi.fn();
    service.onGroupSubmitted(listener);
    realtime.emitWithAck.mockResolvedValue({ submission: studentView({ questionNumber: 3 }) });

    realtime.connected();
    await flush();

    expect(realtime.emitWithAck).toHaveBeenLastCalledWith(OWN, { questionNumber: 3 });
    expect(listener).toHaveBeenCalledExactlyOnceWith(studentView({ questionNumber: 3 }));
  });

  it('uses the question of the last submitAnswer', async () => {
    realtime.emitWithAck.mockResolvedValue({ ok: true, submission: studentView({ questionNumber: 4 }) });
    await service.submitAnswer(4, ['光合作用']);
    service.onGroupSubmitted(vi.fn());
    realtime.emitWithAck.mockResolvedValue({ submission: studentView({ questionNumber: 4 }) });

    realtime.connected();
    await flush();

    expect(realtime.emitWithAck).toHaveBeenLastCalledWith(OWN, { questionNumber: 4 });
  });

  it('tells onJudgement when the submission was REJECTED', async () => {
    realtime.emitWithAck.mockResolvedValue({ submission: null });
    await service.getGroupSubmission(2);
    const judged = vi.fn();
    service.onJudgement(judged);
    realtime.emitWithAck.mockResolvedValue({ submission: studentView({ judgement: 'REJECTED' }) });

    realtime.connected();
    await flush();

    expect(judged).toHaveBeenCalledExactlyOnceWith(studentView({ judgement: 'REJECTED' }));
  });

  it('does not tell onJudgement while the submission is still PENDING', async () => {
    realtime.emitWithAck.mockResolvedValue({ submission: null });
    await service.getGroupSubmission(2);
    const judged = vi.fn();
    service.onJudgement(judged);
    realtime.emitWithAck.mockResolvedValue({ submission: studentView() });

    realtime.connected();
    await flush();

    expect(judged).not.toHaveBeenCalled();
  });

  it('tells nobody when the group has not submitted', async () => {
    realtime.emitWithAck.mockResolvedValue({ submission: null });
    await service.getGroupSubmission(2);
    const submitted = vi.fn();
    const judged = vi.fn();
    service.onGroupSubmitted(submitted);
    service.onJudgement(judged);

    realtime.connected();
    await flush();

    expect(submitted).not.toHaveBeenCalled();
    expect(judged).not.toHaveBeenCalled();
  });

  it('asks nothing before any question was used', async () => {
    service.onGroupSubmitted(vi.fn());
    realtime.connected();
    await flush();
    expect(sent(OWN)).toEqual([]);
  });

  it('asks nothing and tells nobody once the listeners unsubscribed', async () => {
    realtime.emitWithAck.mockResolvedValue({ submission: null });
    await service.getGroupSubmission(2);
    const submitted = vi.fn();
    const judged = vi.fn();
    service.onGroupSubmitted(submitted)();
    service.onJudgement(judged)();
    realtime.emitWithAck.mockResolvedValue({ submission: studentView({ judgement: 'REJECTED' }) });

    realtime.connected();
    await flush();

    expect(sent(OWN)).toHaveLength(1);
    expect(submitted).not.toHaveBeenCalled();
    expect(judged).not.toHaveBeenCalled();
  });
});
