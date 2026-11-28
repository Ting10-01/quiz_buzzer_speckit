import type { Activity } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/services/http/ApiClient';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// T056: cancelActivity and onPhaseChange(null) (contracts/activity-service.md, 001 RD-12;
// spec Edge Cases on cancelling while disconnected or a server restart).
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
  realtime.push({ version: 1, activity: preparing() });
});

describe('HttpActivityService.cancelActivity', () => {
  it('sends DELETE /api/activity', async () => {
    api.request.mockResolvedValue({ version: 2, activity: null });
    await service.cancelActivity();
    expect(api.request).toHaveBeenCalledWith('DELETE', '/api/activity');
  });

  // onActivityChange gets only the catch-up of the activity held when it subscribed (C-1, issue #22).
  it('applies the response before resolving: onPhaseChange gets null, onActivityChange no null', async () => {
    const onPhase = vi.fn();
    const onActivity = vi.fn();
    service.onPhaseChange(onPhase);
    service.onActivityChange(onActivity);
    api.request.mockResolvedValue({ version: 2, activity: null });

    await expect(service.cancelActivity()).resolves.toBeUndefined();
    expect(onPhase.mock.calls).toEqual([[null]]);
    expect(onActivity.mock.calls).toEqual([[preparing()]]);
    await expect(service.getCurrentActivity()).resolves.toBeNull();
  });

  it.each([
    new ApiError(409, 'CANCEL_LOCKED', '第 1 題開放後不能取消活動'),
    new ApiError(401, 'UNAUTHORIZED', '老師登入已失效，請回首頁重新登入'),
  ])('rejects with the ApiError as it is ($status $code)', async (error) => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    api.request.mockRejectedValue(error);
    await expect(service.cancelActivity()).rejects.toBe(error);
    expect(onPhase).not.toHaveBeenCalled();
  });
});

describe('HttpActivityService when the activity is cancelled elsewhere', () => {
  it('notifies onPhaseChange(null) when a push says there is no activity any more', () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    realtime.push({ version: 2, activity: null });
    expect(onPhase.mock.calls).toEqual([[null]]);
  });

  it('still notifies null when the activity was cancelled while this tab was disconnected', () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    realtime.connected();
    realtime.push({ version: 2, activity: null });
    expect(onPhase.mock.calls).toEqual([[null]]);
  });

  it('still notifies null after a server restart ({ version: 0, activity: null } on reconnecting)', () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    realtime.connected();
    realtime.push({ version: 0, activity: null });
    expect(onPhase.mock.calls).toEqual([[null]]);
  });

  it('notifies the new Activity when the teacher creates one again after cancelling (001 RD-12)', () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    realtime.push({ version: 2, activity: null });
    const again = preparing({ groupCount: 6, groups: makeGroups([0, 0, 0, 0, 0, 0]) });
    realtime.push({ version: 3, activity: again });
    expect(onPhase.mock.calls).toEqual([[null], [again]]);
  });

  it('notifies the new Activity even when it has the same phase and group count as the cancelled one', () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    realtime.push({ version: 2, activity: null });
    const again = preparing();
    realtime.push({ version: 3, activity: again });
    expect(onPhase.mock.calls).toEqual([[null], [again]]);
  });
});
