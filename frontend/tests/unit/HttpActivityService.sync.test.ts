import type { Activity } from '@quiz-buzzer/shared/entities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// contracts/activity-service.md "apply(snapshot)", research RA-03 and RA-09; AC-24 (never go back).
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';

let realtime: FakeRealtimeClient;
let api: { request: ReturnType<typeof vi.fn> };
let service: HttpActivityService;

function preparing(overrides: Partial<Activity> = {}): Activity {
  return makeActivity({ phase: 'PREPARING', groups: makeGroups([0, 0, 0, 0]), ...overrides });
}

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  api = { request: vi.fn() };
  service = new HttpActivityService(realtime as never, api as never);
  realtime.connected();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HttpActivityService snapshots', () => {
  it('only takes snapshots with a larger version; older and equal ones are ignored (AC-24)', async () => {
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    const v3 = preparing({ groups: makeGroups([1, 0, 0, 0]) });
    realtime.push({ version: 3, activity: v3 });
    realtime.push({ version: 2, activity: preparing({ phase: 'OPEN', currentQuestion: 1 }) });
    realtime.push({ version: 3, activity: preparing({ groups: makeGroups([9, 9, 9, 9]) }) });
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenCalledWith(v3);
    await expect(service.getCurrentActivity()).resolves.toEqual(v3);
  });

  it('takes the first snapshot after a (re)connection even when its version is smaller', async () => {
    realtime.push({ version: 7, activity: preparing() });
    realtime.connected(); // e.g. the server restarted and counts versions from 0 again
    const restarted = preparing({ groupCount: 6, groups: makeGroups([0, 0, 0, 0, 0, 0]) });
    realtime.push({ version: 1, activity: restarted });
    await expect(service.getCurrentActivity()).resolves.toEqual(restarted);
  });

  it('notifies onActivityChange for every new version', () => {
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    const first = preparing();
    const second = preparing({ groups: makeGroups([1, 0, 0, 0]) });
    realtime.push({ version: 1, activity: first });
    realtime.push({ version: 2, activity: second });
    expect(onActivity.mock.calls).toEqual([[first], [second]]);
  });

  it('notifies onPhaseChange only when phase, current question or group count changes', () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    const created = preparing();
    const moreGroups = preparing({ groupCount: 6, groups: makeGroups([1, 0, 0, 0, 0, 0]) });
    const opened = preparing({ groupCount: 6, groups: makeGroups([1, 0, 0, 0, 0, 0]), phase: 'OPEN', currentQuestion: 1 });
    const ended = { ...opened, phase: 'QUESTION_ENDED' as const };
    const second = { ...opened, currentQuestion: 2 };
    realtime.push({ version: 1, activity: created });
    realtime.push({ version: 2, activity: preparing({ groups: makeGroups([1, 0, 0, 0]) }) }); // only a member joined
    realtime.push({ version: 3, activity: moreGroups });
    realtime.push({ version: 4, activity: opened });
    realtime.push({ version: 5, activity: { ...opened, groups: makeGroups([2, 0, 0, 0, 0, 0]) } }); // member only
    realtime.push({ version: 6, activity: ended });
    realtime.push({ version: 7, activity: second });
    expect(onPhase.mock.calls).toEqual([[created], [moreGroups], [opened], [ended], [second]]);
  });

  it('notifies nobody when the first snapshot after connecting has no activity', () => {
    const onPhase = vi.fn();
    const onActivity = vi.fn();
    service.onPhaseChange(onPhase);
    service.onActivityChange(onActivity);
    realtime.push({ version: 0, activity: null });
    expect(onPhase).not.toHaveBeenCalled();
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const onPhase = vi.fn();
    const onActivity = vi.fn();
    service.onPhaseChange(onPhase)();
    service.onActivityChange(onActivity)();
    realtime.push({ version: 1, activity: preparing() });
    expect(onPhase).not.toHaveBeenCalled();
    expect(onActivity).not.toHaveBeenCalled();
  });
});

describe('HttpActivityService.getCurrentActivity', () => {
  it('answers at once from the snapshot it already has', async () => {
    const activity = preparing();
    realtime.push({ version: 1, activity });
    await expect(service.getCurrentActivity()).resolves.toEqual(activity);
  });

  it('answers null when the snapshot it has says there is no activity', async () => {
    realtime.push({ version: 0, activity: null });
    await expect(service.getCurrentActivity()).resolves.toBeNull();
  });

  it('waits for the next snapshot when it has none yet', async () => {
    const pending = service.getCurrentActivity();
    const activity = preparing();
    realtime.push({ version: 1, activity });
    await expect(pending).resolves.toEqual(activity);
  });

  it('waits again after a reconnection, since the old snapshot may be stale', async () => {
    realtime.push({ version: 4, activity: preparing() });
    realtime.connected();
    const pending = service.getCurrentActivity();
    realtime.push({ version: 0, activity: null });
    await expect(pending).resolves.toBeNull();
  });

  it('rejects with an UnexpectedError after 5 seconds without a snapshot', async () => {
    vi.useFakeTimers();
    const pending = service.getCurrentActivity();
    let settled = false;
    pending.then(
      () => (settled = true),
      () => (settled = true),
    );
    const assertion = expect(pending).rejects.toMatchObject({ message: SERVER_UNREACHABLE });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
});
