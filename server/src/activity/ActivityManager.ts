import { GROUP_COUNT_MAX, GROUP_COUNT_MIN } from '@quiz-buzzer/shared/activityRules';
import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { ActivitySettings, ValidationError } from '@quiz-buzzer/shared/entities';
import type { ImportStore } from '../guided-notes/ImportStore.js';
import type { ActivityState, ActivityStore } from './ActivityStore.js';
import { Audience, toActivity } from './ActivityView.js';
import type { CommandQueue } from './CommandQueue.js';
import type { GroupMembership, SocketRef } from './GroupMembership.js';
import type { SequenceClock } from './SequenceClock.js';

/** A rule does not allow the command; REST answers 409 { code, message } (data-model "ActivityRuleError"). */
export class ActivityRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ActivityRuleError';
  }
}

// data-model "ValidationError 的內容".
const GROUP_COUNT_INVALID = `組數必須是 ${GROUP_COUNT_MIN} 到 ${GROUP_COUNT_MAX} 之間的整數`;

/** The groupCount the request asks for, or the ValidationError explaining why it is not allowed. */
function checkGroupCount(settings: unknown, lowest: number): number | ValidationError {
  const groupCount: unknown = (settings as Partial<ActivitySettings> | null)?.groupCount;
  if (typeof groupCount !== 'number' || !Number.isInteger(groupCount) || groupCount < GROUP_COUNT_MIN || groupCount > GROUP_COUNT_MAX) {
    return { field: 'groupCount', message: GROUP_COUNT_INVALID };
  }
  if (groupCount < lowest) {
    return { field: 'groupCount', message: `第 ${lowest} 組已有學生加入，組數不能少於 ${lowest}` };
  }
  return groupCount;
}

const noActivity = () => new ActivityRuleError('NO_ACTIVITY', '目前沒有活動');
const notNext = (n: number | string) => new ActivityRuleError('QUESTION_NOT_NEXT', `現在不能開放第 ${n} 題`);
const notOpen = (n: number | string) => new ActivityRuleError('QUESTION_NOT_OPEN', `第 ${n} 題目前沒有開放，不能結束`);

/** The part of 002's pino logger 004 writes to (research RA-12). Never given a studentToken. */
export interface ActivityLog {
  info(fields: Record<string, unknown>, message: string): void;
}

const silentLog: ActivityLog = { info: () => {} };

/** The question that may open next: the first while PREPARING, the one after an ended question. */
function nextQuestion(state: Readonly<ActivityState>): number | undefined {
  const numbers = state.questions.map((question) => question.number);
  if (state.phase === 'PREPARING') return numbers[0];
  if (state.phase === 'QUESTION_ENDED') return numbers[numbers.indexOf(state.currentQuestion!) + 1];
  return undefined;
}
const groupLocked = (group: number) => `第 1 題開放後不能換組，你在第 ${group} 組`;

// The activity rules (data-model "ActivityManager"). Every command runs inside CommandQueue.run.
export class ActivityManager {
  constructor(
    private readonly queue: CommandQueue,
    private readonly store: ActivityStore,
    private readonly membership: GroupMembership,
    private readonly clock: SequenceClock,
    private readonly importStore: ImportStore,
    private readonly log: ActivityLog = silentLog,
  ) {}

  /** null -> PREPARING with the questions of the latest import (AC-03). */
  createActivity(settings: ActivitySettings): ActivitySnapshot | ValidationError {
    return this.queue.run(() => {
      if (this.store.current()) {
        throw new ActivityRuleError('ACTIVITY_EXISTS', '已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器');
      }
      const imported = this.importStore.latest();
      if (!imported) throw new ActivityRuleError('NO_IMPORT', '請先匯入學習單');
      const groupCount = checkGroupCount(settings, 0);
      if (typeof groupCount !== 'number') return groupCount;
      this.store.commit({
        spreadsheet: structuredClone(imported.spreadsheet),
        questions: structuredClone(imported.questions),
        groupCount,
        phase: 'PREPARING',
        openedAt: new Map(),
        endedAt: new Map(),
      });
      this.log.info(
        { event: 'activity.created', groupCount, questionCount: imported.questions.length, version: this.store.version() },
        'activity.created',
      );
      return this.snapshot(Audience.TEACHER);
    });
  }

  /** Changes the group count while PREPARING; never below a group that has students (AC-05). */
  updateSettings(settings: ActivitySettings): ActivitySnapshot | ValidationError {
    return this.queue.run(() => {
      const state = this.store.current();
      if (!state) throw noActivity();
      if (state.phase !== 'PREPARING') throw new ActivityRuleError('SETTINGS_LOCKED', '第 1 題開放後不能修改設定');
      const groupCount = checkGroupCount(settings, this.membership.highestOccupiedGroup());
      if (typeof groupCount !== 'number') return groupCount;
      this.store.commit({ ...state, groupCount });
      return this.snapshot(Audience.TEACHER);
    });
  }

  /** PREPARING -> no activity, emptying every group; without an activity nothing changes (research RA-17). */
  cancelActivity(): ActivitySnapshot {
    return this.queue.run(() => {
      const state = this.store.current();
      if (state) {
        if (state.phase !== 'PREPARING') throw new ActivityRuleError('CANCEL_LOCKED', '第 1 題開放後不能取消活動');
        this.membership.reset();
        const version = this.store.commit(null);
        this.log.info({ event: 'activity.cancelled', version }, 'activity.cancelled');
      }
      return this.snapshot(Audience.TEACHER);
    });
  }

  /**
   * Puts the connection in group n (data-model "組別規則"). Once question 1 has opened a tab that has
   * joined cannot move; a tab that has not joined may still join any group. Rules answer in the ack.
   */
  joinGroup(socket: SocketRef, groupNumber: number): GroupAck {
    return this.queue.run(() => {
      const state = this.store.current();
      if (!state) return this.refuse('NO_ACTIVITY', '目前沒有活動');
      if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > state.groupCount) {
        return this.refuse('NO_SUCH_GROUP', `沒有第 ${groupNumber} 組`);
      }
      const current = this.membership.groupOf(socket);
      if (current !== null && current !== groupNumber && state.phase !== 'PREPARING') {
        return this.refuse('GROUP_LOCKED', groupLocked(current));
      }
      const studentToken = this.membership.join(socket, groupNumber);
      // Members are not part of ActivityState, so the same state is committed to add 1 to the version.
      this.store.commit(state);
      this.logGroup('group.joined', groupNumber, state.groupCount);
      return { snapshot: this.snapshot(Audience.PUBLIC), studentToken };
    });
  }

  /** Leaves the group while PREPARING; a tab that has not joined succeeds without a change. */
  leaveGroup(socket: SocketRef): GroupAck {
    return this.queue.run(() => {
      const state = this.store.current();
      const current = this.membership.groupOf(socket);
      if (state && current !== null && state.phase !== 'PREPARING') {
        return this.refuse('GROUP_LOCKED', groupLocked(current));
      }
      this.membership.leave(socket);
      if (state) {
        this.store.commit(state);
        if (current !== null) this.logGroup('group.left', current, state.groupCount);
      }
      return { snapshot: this.snapshot(Audience.PUBLIC) };
    });
  }

  /**
   * PREPARING -> OPEN(first) or QUESTION_ENDED(n) -> OPEN(next), stamping openedAt[n] (REQ-ACT-05, 18).
   * Opening the open question again answers the current snapshot without a change (REQ-ACT-07).
   */
  openQuestion(questionNumber: number): ActivitySnapshot {
    return this.queue.run(() => {
      const state = this.store.current();
      if (!state) throw noActivity();
      if (state.phase === 'OPEN' && state.currentQuestion === questionNumber) return this.snapshot(Audience.TEACHER);
      if (questionNumber !== nextQuestion(state)) throw notNext(questionNumber);
      const version = this.store.commit({
        ...state,
        phase: 'OPEN',
        currentQuestion: questionNumber,
        openedAt: new Map(state.openedAt).set(questionNumber, this.clock.stamp()),
      });
      this.log.info({ event: 'question.opened', question: questionNumber, version }, 'question.opened');
      return this.snapshot(Audience.TEACHER);
    });
  }

  /**
   * OPEN(n) -> QUESTION_ENDED(n), or FINISHED for the last question (REQ-ACT-06), stamping endedAt[n].
   * Ending an already ended question answers the current snapshot, so the teacher and 005's
   * judgement end it only once (REQ-ACT-07, 08). 005 may call this inside its own CommandQueue.run.
   */
  endQuestion(questionNumber: number): ActivitySnapshot {
    return this.queue.run(() => {
      const state = this.store.current();
      if (!state) throw noActivity();
      const ended = state.phase === 'QUESTION_ENDED' || state.phase === 'FINISHED';
      if (ended && Number.isInteger(questionNumber) && questionNumber >= 1 && questionNumber <= state.currentQuestion!) {
        return this.snapshot(Audience.TEACHER);
      }
      if (state.phase !== 'OPEN' || state.currentQuestion !== questionNumber) throw notOpen(questionNumber);
      const isLast = state.questions.at(-1)?.number === questionNumber;
      const version = this.store.commit({
        ...state,
        phase: isLast ? 'FINISHED' : 'QUESTION_ENDED',
        endedAt: new Map(state.endedAt).set(questionNumber, this.clock.stamp()),
      });
      this.log.info({ event: 'question.ended', question: questionNumber, finished: isLast, version }, 'question.ended');
      return this.snapshot(Audience.TEACHER);
    });
  }

  /** The current state for the audience. Read-only, so it may also be called inside CommandQueue.run. */
  snapshot(audience: Audience): ActivitySnapshot {
    const state = this.store.current();
    return {
      version: this.store.version(),
      activity: state && toActivity(state, this.membership.memberCounts(state.groupCount), audience),
    };
  }

  /** Group and member counts only; the connection and its studentToken are never logged (RA-12). */
  private logGroup(event: string, group: number, groupCount: number): void {
    this.log.info({ event, group, memberCounts: this.membership.memberCounts(groupCount), version: this.store.version() }, event);
  }

  /** A refused group command: nothing changes and the ack carries the current PUBLIC snapshot. */
  private refuse(code: string, message: string): GroupAck {
    return { snapshot: this.snapshot(Audience.PUBLIC), error: { code, message } };
  }
}
