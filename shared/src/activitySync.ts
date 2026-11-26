// Payloads of 004's Socket.IO events (contracts/socket-events.md). Use isValidationError from ./guards.
import type { Activity } from './entities';

/** `activity:snapshot`. `version` only grows; `activity` is null when there is no activity. */
export interface ActivitySnapshot {
  version: number;
  activity: Activity | null;
}

/** Ack of `group:join` and `group:leave`; `snapshot` is the PUBLIC view after handling. */
export interface GroupAck {
  snapshot: ActivitySnapshot;
  /** Present when a join succeeded: this tab's student identity. */
  studentToken?: string;
  /** Present when rejected: NO_ACTIVITY, NO_SUCH_GROUP or GROUP_LOCKED. */
  error?: { code: string; message: string };
}
