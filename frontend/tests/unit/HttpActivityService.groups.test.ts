import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Activity } from '@quiz-buzzer/shared/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpActivityService } from '../../src/services/HttpActivityService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeActivity, makeGroups } from '../helpers/fixtures';

// T031: joinGroup / leaveGroup over RealtimeClient (contracts/activity-service.md, research RA-10).
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';
const LOCKED = '第 1 題開放後不能換組，你在第 3 組';

let realtime: FakeRealtimeClient;
let api: { request: ReturnType<typeof vi.fn> };
let service: HttpActivityService;

function preparing(memberCounts: number[]): Activity {
  return makeActivity({ phase: 'PREPARING', groupCount: memberCounts.length, groups: makeGroups(memberCounts) });
}

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  api = { request: vi.fn() };
  service = new HttpActivityService(realtime as never, api as never);
  realtime.connected();
  realtime.push({ version: 1, activity: preparing([0, 0, 0, 0]) });
});

describe('HttpActivityService.joinGroup', () => {
  it('sends group:join with the group number', async () => {
    realtime.emitWithAck.mockResolvedValue({ snapshot: { version: 2, activity: preparing([0, 0, 1, 0]) }, studentToken: 't' });
    await service.joinGroup(3);
    expect(realtime.emitWithAck).toHaveBeenCalledWith('group:join', { groupNumber: 3 });
  });

  it('stores the studentToken, applies the snapshot and resolves with its Activity', async () => {
    const joined = preparing([0, 0, 1, 0]);
    const ack: GroupAck = { snapshot: { version: 2, activity: joined }, studentToken: 'student-token-1' };
    realtime.emitWithAck.mockResolvedValue(ack);
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);

    await expect(service.joinGroup(3)).resolves.toEqual(joined);
    expect(realtime.studentToken()).toBe('student-token-1');
    expect(onActivity).toHaveBeenCalledWith(joined);
    await expect(service.getCurrentActivity()).resolves.toEqual(joined);
  });

  it('resolves with the Activity of the ack even when a newer push already arrived', async () => {
    const joined = preparing([0, 0, 1, 0]);
    const newer = preparing([0, 1, 1, 0]);
    realtime.emitWithAck.mockImplementation(async () => {
      realtime.push({ version: 3, activity: newer });
      return { snapshot: { version: 2, activity: joined }, studentToken: 't' };
    });
    await expect(service.joinGroup(3)).resolves.toEqual(joined);
    await expect(service.getCurrentActivity()).resolves.toEqual(newer);
  });

  it.each([
    ['NO_SUCH_GROUP', '沒有第 9 組'],
    ['GROUP_LOCKED', LOCKED],
  ])('applies the snapshot, then rejects with UnexpectedError(message) on %s', async (code, message) => {
    const current = preparing([1, 0, 1, 0]);
    realtime.emitWithAck.mockResolvedValue({ snapshot: { version: 4, activity: current }, error: { code, message } });
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);

    await expect(service.joinGroup(9)).rejects.toMatchObject({ message });
    expect(onActivity).toHaveBeenCalledWith(current);
    await expect(service.getCurrentActivity()).resolves.toEqual(current);
    expect(realtime.studentToken()).toBeNull();
  });

  it('applies { activity: null } then rejects on NO_ACTIVITY (the teacher just cancelled)', async () => {
    const onPhase = vi.fn();
    service.onPhaseChange(onPhase);
    realtime.emitWithAck.mockResolvedValue({
      snapshot: { version: 2, activity: null },
      error: { code: 'NO_ACTIVITY', message: '目前沒有活動' },
    });

    await expect(service.joinGroup(1)).rejects.toMatchObject({ message: '目前沒有活動' });
    expect(onPhase).toHaveBeenLastCalledWith(null);
    await expect(service.getCurrentActivity()).resolves.toBeNull();
  });

  it('rejects with 「連不上伺服器，請確認伺服器已啟動」 when the ack times out', async () => {
    realtime.emitWithAck.mockRejectedValue(new Error(SERVER_UNREACHABLE));
    await expect(service.joinGroup(3)).rejects.toMatchObject({ message: SERVER_UNREACHABLE });
    expect(realtime.studentToken()).toBeNull();
  });
});

describe('HttpActivityService.leaveGroup', () => {
  it('sends group:leave and applies the snapshot before resolving', async () => {
    const left = preparing([0, 0, 0, 0]);
    realtime.emitWithAck.mockResolvedValue({ snapshot: { version: 3, activity: left } });
    const onActivity = vi.fn();
    service.onActivityChange(onActivity);

    await expect(service.leaveGroup()).resolves.toBeUndefined();
    expect(realtime.emitWithAck).toHaveBeenCalledWith('group:leave', {});
    expect(onActivity).toHaveBeenCalledWith(left);
  });

  it('rejects with UnexpectedError(message) when the ack has an error', async () => {
    realtime.emitWithAck.mockResolvedValue({
      snapshot: { version: 3, activity: makeActivity({ phase: 'OPEN', currentQuestion: 1 }) },
      error: { code: 'GROUP_LOCKED', message: LOCKED },
    });
    await expect(service.leaveGroup()).rejects.toMatchObject({ message: LOCKED });
  });

  it('rejects with 「連不上伺服器，請確認伺服器已啟動」 when the ack times out', async () => {
    realtime.emitWithAck.mockRejectedValue(new Error(SERVER_UNREACHABLE));
    await expect(service.leaveGroup()).rejects.toMatchObject({ message: SERVER_UNREACHABLE });
  });
});
