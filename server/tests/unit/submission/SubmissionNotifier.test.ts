import { GROUP_SUBMITTED, JUDGED, SUBMISSIONS_CHANGED } from '@quiz-buzzer/shared/submissionEvents';
import type { Server } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupMembership, SocketRef } from '../../../src/activity/GroupMembership.js';
import { TEACHER_ROOM } from '../../../src/realtime/socketServer.js';
import { SubmissionNotifier } from '../../../src/submission/SubmissionNotifier.js';
import { SubmissionStore } from '../../../src/submission/SubmissionStore.js';
import { SubmissionVisibility } from '../../../src/submission/SubmissionVisibility.js';
import { submissionRecord } from '../../helpers/submissionRecord.js';

// data-model section 4 "SubmissionNotifier"; research RD-05, 004 RA-04; REQ-SUB-10, REQ-SUB-15, REQ-SUB-20.

interface FakeSocket extends SocketRef {
  emit: ReturnType<typeof vi.fn>;
}

// The parts of Socket.IO's Server the notifier uses: io.to(room).emit and the default namespace's sockets.
function fakeIo(sockets: FakeSocket[]) {
  const roomEmit = vi.fn();
  const to = vi.fn(() => ({ emit: roomEmit }));
  const io = { to, sockets: { sockets: new Map(sockets.map((s) => [s.id, s])) } };
  return { io: io as unknown as Server, to, roomEmit };
}

function fakeSocket(id: string): FakeSocket {
  return { id, emit: vi.fn() };
}

// socket id -> group; a socket not listed has not joined a group.
function fakeMembership(groups: Record<string, number>): GroupMembership {
  return { groupOf: (socket: SocketRef) => groups[socket.id] ?? null } as unknown as GroupMembership;
}

/** Runs the callbacks queued with setImmediate (and nothing timed later). */
function runImmediates(): void {
  vi.advanceTimersByTime(0);
}

describe('SubmissionNotifier', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'clearImmediate'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('submissionsChanged (teacher list)', () => {
    function setup() {
      const store = new SubmissionStore();
      const { io, to, roomEmit } = fakeIo([]);
      const notifier = new SubmissionNotifier(io, store, new SubmissionVisibility(), fakeMembership({}));
      return { store, notifier, to, roomEmit };
    }

    it('does not emit when called, only after setImmediate, to TEACHER_ROOM with the full list', () => {
      const { store, notifier, to, roomEmit } = setup();
      store.append(submissionRecord({ groupNumber: 2, rank: 1 }));

      notifier.submissionsChanged(1);
      expect(roomEmit).not.toHaveBeenCalled();

      runImmediates();
      expect(to).toHaveBeenCalledWith(TEACHER_ROOM);
      expect(roomEmit).toHaveBeenCalledTimes(1);
      expect(roomEmit).toHaveBeenCalledWith(SUBMISSIONS_CHANGED, { questionNumber: 1, submissions: store.list(1) });
      expect(roomEmit.mock.calls[0]![1].submissions[0].rank).toBe(1);
    });

    it('sends repeated changes within 200 ms once, at the end of the window, with the newest list', () => {
      const { store, notifier, roomEmit } = setup();
      store.append(submissionRecord({ groupNumber: 1, rank: 1 }));
      notifier.submissionsChanged(1);
      runImmediates();
      expect(roomEmit).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      store.append(submissionRecord({ groupNumber: 2, rank: 2 }));
      notifier.submissionsChanged(1);
      vi.advanceTimersByTime(50);
      store.append(submissionRecord({ groupNumber: 3, rank: 3 }));
      notifier.submissionsChanged(1);
      runImmediates();
      expect(roomEmit).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(99);
      expect(roomEmit).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(roomEmit).toHaveBeenCalledTimes(2);
      expect(roomEmit).toHaveBeenLastCalledWith(SUBMISSIONS_CHANGED, {
        questionNumber: 1,
        submissions: store.list(1),
      });
      expect(roomEmit.mock.lastCall![1].submissions).toHaveLength(3);

      vi.advanceTimersByTime(1000);
      expect(roomEmit).toHaveBeenCalledTimes(2);
    });

    it('sends right after setImmediate again once 200 ms passed without a push', () => {
      const { notifier, roomEmit } = setup();
      notifier.submissionsChanged(1);
      runImmediates();
      vi.advanceTimersByTime(500);
      expect(roomEmit).toHaveBeenCalledTimes(1);

      notifier.submissionsChanged(1);
      expect(roomEmit).toHaveBeenCalledTimes(1);
      runImmediates();
      expect(roomEmit).toHaveBeenCalledTimes(2);
    });

    it('sends each changed question once at the end of the window', () => {
      const { store, notifier, roomEmit } = setup();
      notifier.submissionsChanged(1);
      runImmediates();

      store.append(submissionRecord({ questionNumber: 1, groupNumber: 1 }));
      store.append(submissionRecord({ questionNumber: 2, groupNumber: 1 }));
      notifier.submissionsChanged(1);
      notifier.submissionsChanged(2);
      notifier.submissionsChanged(1);
      vi.advanceTimersByTime(200);

      const sent = roomEmit.mock.calls.slice(1).map((call) => call[1].questionNumber);
      expect(sent.sort()).toEqual([1, 2]);
    });
  });

  describe('groupSubmitted and judged (one group)', () => {
    function setup() {
      const sockets = [fakeSocket('a1'), fakeSocket('a2'), fakeSocket('b1'), fakeSocket('none')];
      const { io, roomEmit } = fakeIo(sockets);
      const membership = fakeMembership({ a1: 2, a2: 2, b1: 3 });
      const notifier = new SubmissionNotifier(io, new SubmissionStore(), new SubmissionVisibility(), membership);
      const [a1, a2, b1, none] = sockets as [FakeSocket, FakeSocket, FakeSocket, FakeSocket];
      return { notifier, a1, a2, b1, none, roomEmit };
    }

    it('groupSubmitted sends the student view after setImmediate to every connection of that group only (REQ-SUB-20)', () => {
      const { notifier, a1, a2, b1, none, roomEmit } = setup();
      const record = submissionRecord({ groupNumber: 2, rank: 3 });

      notifier.groupSubmitted(record);
      expect(a1.emit).not.toHaveBeenCalled();
      expect(a2.emit).not.toHaveBeenCalled();

      runImmediates();
      const expected = { submission: { ...new SubmissionVisibility().forStudent(record) } };
      expect(expected.submission.rank).toBe(0);
      expect(a1.emit).toHaveBeenCalledExactlyOnceWith(GROUP_SUBMITTED, expected);
      expect(a2.emit).toHaveBeenCalledExactlyOnceWith(GROUP_SUBMITTED, expected);
      expect(b1.emit).not.toHaveBeenCalled();
      expect(none.emit).not.toHaveBeenCalled();
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('does not merge group notices: two calls send twice', () => {
      const { notifier, a1 } = setup();
      notifier.groupSubmitted(submissionRecord({ groupNumber: 2, questionNumber: 1 }));
      notifier.groupSubmitted(submissionRecord({ groupNumber: 2, questionNumber: 2 }));
      runImmediates();
      expect(a1.emit).toHaveBeenCalledTimes(2);
    });

    it('judged sends the student view after setImmediate to that group only (REQ-SUB-15)', () => {
      const { notifier, a1, a2, b1, none } = setup();
      const record = submissionRecord({ groupNumber: 2, rank: 1, judgement: 'REJECTED' });

      notifier.judged(record);
      expect(a1.emit).not.toHaveBeenCalled();

      runImmediates();
      const expected = { submission: new SubmissionVisibility().forStudent(record) };
      expect(a1.emit).toHaveBeenCalledExactlyOnceWith(JUDGED, expected);
      expect(a2.emit).toHaveBeenCalledExactlyOnceWith(JUDGED, expected);
      expect(a1.emit.mock.calls[0]![1].submission.rank).toBe(0);
      expect(a1.emit.mock.calls[0]![1].submission.judgement).toBe('REJECTED');
      expect(b1.emit).not.toHaveBeenCalled();
      expect(none.emit).not.toHaveBeenCalled();
    });

    it('judged sends ACCEPTED to the group as well', () => {
      const { notifier, a1 } = setup();
      notifier.judged(submissionRecord({ groupNumber: 2, judgement: 'ACCEPTED' }));
      runImmediates();
      expect(a1.emit.mock.calls[0]![1].submission.judgement).toBe('ACCEPTED');
    });

    it('judged does not notify an UNJUDGED record', () => {
      const { notifier, a1, a2 } = setup();
      notifier.judged(submissionRecord({ groupNumber: 2, judgement: 'UNJUDGED' }));
      vi.advanceTimersByTime(1000);
      expect(a1.emit).not.toHaveBeenCalled();
      expect(a2.emit).not.toHaveBeenCalled();
    });
  });
});
