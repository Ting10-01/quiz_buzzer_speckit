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
