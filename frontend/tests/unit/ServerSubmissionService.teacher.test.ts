import type { Submission } from '@quiz-buzzer/shared/entities';
import { SUBMISSIONS_CHANGED } from '@quiz-buzzer/shared/submissionEvents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/services/http/ApiClient';
import { ServerSubmissionService } from '../../src/services/server/ServerSubmissionService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeActivity, makeSubmission } from '../helpers/fixtures';

// T038: the teacher methods of ServerSubmissionService through 002's ApiClient and 004's RealtimeClient
// (contracts/submission-api.md sections 2–3, research RD-08); AC-09, AC-29.
let realtime: FakeRealtimeClient;
let api: { request: ReturnType<typeof vi.fn> };
let service: ServerSubmissionService;

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  api = { request: vi.fn() };
  service = new ServerSubmissionService(realtime as never, api as never);
});

function teacherList(questionNumber: number, groups: number[]): Submission[] {
  return groups.map((groupNumber, i) => makeSubmission({ questionNumber, groupNumber, rank: i + 1, judgement: 'PENDING' }));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ServerSubmissionService.listSubmissions', () => {
  it('follows the teacher credential, then sends GET /api/questions/:n/submissions and answers the list', async () => {
    const submissions = teacherList(2, [3, 1]);
    api.request.mockResolvedValue(submissions);

    await expect(service.listSubmissions(2)).resolves.toEqual(submissions);
    expect(api.request).toHaveBeenCalledExactlyOnceWith('GET', '/api/questions/2/submissions');
    expect(realtime.followTeacherCredential).toHaveBeenCalled();
    expect(realtime.followTeacherCredential.mock.invocationCallOrder[0]).toBeLessThan(api.request.mock.invocationCallOrder[0]);
  });

  it('rejects with the ApiClient’s error as it is', async () => {
    const error = new ApiError(401, 'UNAUTHORIZED', '老師登入已失效，請回首頁重新登入');
    api.request.mockRejectedValue(error);
    await expect(service.listSubmissions(2)).rejects.toBe(error);
  });
});

describe('ServerSubmissionService.onSubmissionsChange', () => {
  it('follows the teacher credential so the connection is in TEACHER_ROOM', () => {
    service.onSubmissionsChange(2, vi.fn());
    expect(realtime.followTeacherCredential).toHaveBeenCalled();
  });

  it('hands over only the lists of question n (AC-09)', () => {
    const listener = vi.fn();
    service.onSubmissionsChange(2, listener);

    realtime.emit(SUBMISSIONS_CHANGED, { questionNumber: 1, submissions: teacherList(1, [4]) });
    realtime.emit(SUBMISSIONS_CHANGED, { questionNumber: 2, submissions: teacherList(2, [3, 1]) });

    expect(listener).toHaveBeenCalledExactlyOnceWith(teacherList(2, [3, 1]));
  });

  it('reads the list again on reconnecting and hands it over (AC-29)', async () => {
    const listener = vi.fn();
    service.onSubmissionsChange(2, listener);
    api.request.mockResolvedValue(teacherList(2, [3, 1, 2]));

    realtime.connected();
    await flush();

    expect(api.request).toHaveBeenCalledWith('GET', '/api/questions/2/submissions');
    expect(listener).toHaveBeenCalledExactlyOnceWith(teacherList(2, [3, 1, 2]));
  });

  it('stops handing over lists and reading again after unsubscribing', async () => {
    const listener = vi.fn();
    service.onSubmissionsChange(2, listener)();

    realtime.emit(SUBMISSIONS_CHANGED, { questionNumber: 2, submissions: teacherList(2, [1]) });
    realtime.connected();
    await flush();

    expect(listener).not.toHaveBeenCalled();
    expect(api.request).not.toHaveBeenCalled();
  });
});

// T020: judge through 002's ApiClient (contracts/submission-api.md section 3); AC-10–AC-12.
describe('ServerSubmissionService.judge', () => {
  it('follows the teacher credential, then sends POST /api/questions/:q/judgements and answers the JudgeOutcome', async () => {
    const outcome = {
      submissions: [makeSubmission({ questionNumber: 2, groupNumber: 3, rank: 1, judgement: 'ACCEPTED' })],
      activity: makeActivity({ phase: 'QUESTION_ENDED', currentQuestion: 2 }),
    };
    api.request.mockResolvedValue(outcome);

    await expect(service.judge(2, 3, 'ACCEPTED')).resolves.toEqual(outcome);
    expect(api.request).toHaveBeenCalledExactlyOnceWith('POST', '/api/questions/2/judgements', {
      groupNumber: 3,
      judgement: 'ACCEPTED',
    });
    expect(realtime.followTeacherCredential).toHaveBeenCalled();
    expect(realtime.followTeacherCredential.mock.invocationCallOrder[0]).toBeLessThan(api.request.mock.invocationCallOrder[0]);
    expect(realtime.emitWithAck).not.toHaveBeenCalled();
  });

  it('sends REJECTED the same way', async () => {
    api.request.mockResolvedValue({ submissions: [], activity: makeActivity({ phase: 'OPEN', currentQuestion: 1 }) });
    await service.judge(1, 4, 'REJECTED');
    expect(api.request).toHaveBeenCalledExactlyOnceWith('POST', '/api/questions/1/judgements', {
      groupNumber: 4,
      judgement: 'REJECTED',
    });
  });

  it('rejects with the ApiClient’s error as it is', async () => {
    const error = new ApiError(409, 'NO_ACTIVITY', '目前沒有活動');
    api.request.mockRejectedValue(error);
    await expect(service.judge(2, 1, 'ACCEPTED')).rejects.toBe(error);
  });
});
