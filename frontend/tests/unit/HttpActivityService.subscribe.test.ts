// T173: onActivityChange catches up with the activity taken before the listener subscribed
// (001 C-1, contracts/activity-service.md; issue #22). T-Lobby subscribes only while it is shown,
// so members who joined or left while the teacher was on T-Setup must still reach it.
import type { Activity } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeActivity, makeGroups } from '../helpers/fixtures';

let realtime: FakeRealtimeClient;
let service: HttpActivityService;

function preparing(members: number[]): Activity {
  return makeActivity({ phase: 'PREPARING', groups: makeGroups(members) });
}

/** Lets the catch-up notification, which runs in a microtask, happen. */
const settle = () => Promise.resolve();

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  service = new HttpActivityService(realtime as never, { request: vi.fn() } as never);
  realtime.connected();
});

describe('HttpActivityService.onActivityChange catch-up (C-1; issue #22)', () => {
  it('notifies the current activity once when subscribing after a snapshot was taken', async () => {
    const joined = preparing([1, 0, 0, 0]);
    realtime.push({ version: 1, activity: joined });
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    await settle();
    expect(onActivity.mock.calls).toEqual([[joined]]);
  });

  it('does not notify a listener that unsubscribed before the catch-up (view unmounted)', async () => {
    realtime.push({ version: 1, activity: preparing([1, 0, 0, 0]) });
    const onActivity = vi.fn();
    service.onActivityChange(onActivity)();
    await settle();
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('does not notify before any snapshot, and later snapshots still arrive (edge)', async () => {
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    await settle();
    expect(onActivity).not.toHaveBeenCalled();
    const joined = preparing([1, 0, 0, 0]);
    realtime.push({ version: 1, activity: joined });
    expect(onActivity.mock.calls).toEqual([[joined]]);
  });

  it('does not notify when the current snapshot has no activity (edge)', async () => {
    realtime.push({ version: 1, activity: null });
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    await settle();
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('notifies only the newer snapshot when one arrives before the catch-up (edge)', async () => {
    realtime.push({ version: 1, activity: preparing([1, 0, 0, 0]) });
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);
    const left = preparing([0, 0, 0, 0]);
    realtime.push({ version: 2, activity: left });
    await settle();
    expect(onActivity.mock.calls).toEqual([[left]]);
  });
});
