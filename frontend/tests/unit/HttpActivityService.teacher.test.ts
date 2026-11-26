import type { Activity } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/services/http/ApiClient';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// T025: createActivity and updateSettings through 002's ApiClient (contracts/activity-service.md,
// research RA-10).
const GROUP_COUNT_INVALID = { field: 'groupCount', message: '組數必須是 2 到 20 之間的整數' };

let realtime: FakeRealtimeClient;
let api: { request: ReturnType<typeof vi.fn> };
let service: HttpActivityService;

function preparing(overrides: Partial<Activity> = {}): Activity {
  return makeActivity({ phase: 'PREPARING', groupCount: 4, groups: makeGroups([0, 0, 0, 0]), ...overrides });
}

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  api = { request: vi.fn() };
  service = new HttpActivityService(realtime as never, api as never);
  realtime.connected();
  realtime.push({ version: 0, activity: null });
});

const commands = [
  {
    name: 'createActivity',
    method: 'POST',
    path: '/api/activity',
    call: (s: HttpActivityService) => s.createActivity({ groupCount: 4 }),
    body: { groupCount: 4 },
  },
  {
    name: 'updateSettings',
    method: 'PUT',
    path: '/api/activity/settings',
    call: (s: HttpActivityService) => s.updateSettings({ groupCount: 4 }),
    body: { groupCount: 4 },
  },
] as const;

describe.each(commands)('HttpActivityService.$name', ({ method, path, call, body }) => {
  it(`sends ${method} ${path} with the settings`, async () => {
    api.request.mockResolvedValue({ version: 1, activity: preparing() });
    await call(service);
    expect(api.request).toHaveBeenCalledWith(method, path, body);
  });

  it('answers the Activity and takes its version', async () => {
    const activity = preparing();
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    api.request.mockResolvedValue({ version: 3, activity });

    await expect(call(service)).resolves.toEqual(activity);
    expect(onActivity).toHaveBeenCalledWith(activity);
    await expect(service.getCurrentActivity()).resolves.toEqual(activity);

    // The push of the same version that follows is ignored (contracts/activity-http.md "範例").
    realtime.push({ version: 3, activity: preparing({ groups: makeGroups([9, 9, 9, 9]) }) });
    expect(onActivity).toHaveBeenCalledTimes(1);
    await expect(service.getCurrentActivity()).resolves.toEqual(activity);
  });

  it('does not go back when a newer push arrived before the response (AC-24)', async () => {
    const newer = preparing({ groups: makeGroups([1, 0, 0, 0]) });
    realtime.push({ version: 4, activity: newer });
    api.request.mockResolvedValue({ version: 3, activity: preparing() });
    await call(service);
    await expect(service.getCurrentActivity()).resolves.toEqual(newer);
  });

  it('answers a ValidationError body as it is and takes no version', async () => {
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    api.request.mockResolvedValue(GROUP_COUNT_INVALID);

    await expect(call(service)).resolves.toEqual(GROUP_COUNT_INVALID);
    expect(onActivity).not.toHaveBeenCalled();
    await expect(service.getCurrentActivity()).resolves.toBeNull();
  });

  it.each([
    new ApiError(409, 'ACTIVITY_EXISTS', '已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器'),
    new ApiError(401, 'UNAUTHORIZED', '老師登入已失效，請回首頁重新登入'),
    new ApiError(0, 'NETWORK', '連不上伺服器，請確認伺服器已啟動'),
  ])('rejects with the ApiError as it is ($status $code)', async (error) => {
    api.request.mockRejectedValue(error);
    await expect(call(service)).rejects.toBe(error);
  });
});

// T038: openQuestion and endQuestion (contracts/activity-service.md); AC-17–20, AC-24.
const questionCommands = [
  {
    name: 'openQuestion',
    call: (s: HttpActivityService) => s.openQuestion(2),
    path: '/api/activity/questions/2/open',
    answer: () => preparing({ phase: 'OPEN', currentQuestion: 2 }),
  },
  {
    name: 'endQuestion',
    call: (s: HttpActivityService) => s.endQuestion(2),
    path: '/api/activity/questions/2/end',
    answer: () => preparing({ phase: 'QUESTION_ENDED', currentQuestion: 2 }),
  },
] as const;

describe.each(questionCommands)('HttpActivityService.$name', ({ call, path, answer }) => {
  it(`sends POST ${path} without a body`, async () => {
    api.request.mockResolvedValue({ version: 5, activity: answer() });
    await call(service);
    expect(api.request).toHaveBeenCalledTimes(1);
    const [method, sentPath, body] = api.request.mock.calls[0]!;
    expect([method, sentPath, body]).toEqual(['POST', path, undefined]);
  });

  it('answers the Activity, takes its version and notifies the phase change', async () => {
    const activity = answer();
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    api.request.mockResolvedValue({ version: 5, activity });

    await expect(call(service)).resolves.toEqual(activity);
    expect(onPhase).toHaveBeenCalledWith(activity);
    await expect(service.getCurrentActivity()).resolves.toEqual(activity);
  });

  it('does not go back when a newer push arrived before the response (AC-24)', async () => {
    const newer = preparing({ phase: 'OPEN', currentQuestion: 3 });
    realtime.push({ version: 9, activity: newer });
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    api.request.mockResolvedValue({ version: 5, activity: answer() });

    await call(service);
    await expect(service.getCurrentActivity()).resolves.toEqual(newer);
    expect(onPhase).not.toHaveBeenCalled();
  });

  it.each([
    new ApiError(409, 'QUESTION_NOT_NEXT', '現在不能開放第 2 題'),
    new ApiError(409, 'QUESTION_NOT_OPEN', '第 2 題目前沒有開放，不能結束'),
    new ApiError(401, 'UNAUTHORIZED', '老師登入已失效，請回首頁重新登入'),
    new ApiError(0, 'NETWORK', '連不上伺服器，請確認伺服器已啟動'),
  ])('rejects with the ApiError as it is ($status $code)', async (error) => {
    api.request.mockRejectedValue(error);
    await expect(call(service)).rejects.toBe(error);
  });
});

describe('HttpActivityService.endQuestion on the last question', () => {
  it('answers FINISHED (AC-20)', async () => {
    const finished = preparing({ phase: 'FINISHED', currentQuestion: 4 });
    api.request.mockResolvedValue({ version: 6, activity: finished });
    await expect(service.endQuestion(4)).resolves.toEqual(finished);
    expect(api.request.mock.calls[0]!.slice(0, 2)).toEqual(['POST', '/api/activity/questions/4/end']);
  });
});
