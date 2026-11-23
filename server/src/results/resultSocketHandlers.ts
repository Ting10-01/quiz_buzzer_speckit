import type { Server } from 'socket.io';
import type { GroupMembership } from '../temp-deps/activity.js';
import { ResultQueryError, type ResultQuery } from './ResultQuery.js';

type Ack = (response: unknown) => void;

// Answers with { ok: true, ...value } or, for a ResultQueryError, { ok: false, code, message }
// (contracts/results-api.md; the same fields as 002's ErrorBody).
function answer(ack: unknown, run: () => object): void {
  if (typeof ack !== 'function') return;
  try {
    (ack as Ack)({ ok: true, ...run() });
  } catch (error) {
    if (!(error instanceof ResultQueryError)) throw error;
    (ack as Ack)({ ok: false, code: error.code, message: error.message });
  }
}

// result:* on 002's app.io. Reading needs no teacher token; the group is the one 004 knows for
// this connection, never one from the payload (constitution VI).
export function registerResultHandlers(io: Server, query: ResultQuery, members: GroupMembership): void {
  io.on('connection', (socket) => {
    socket.on('result:question', (payload: unknown, ack: unknown) => {
      const questionNumber = (payload as { questionNumber?: unknown } | null)?.questionNumber;
      answer(ack, () => ({ result: query.questionResult(questionNumber as number, members.groupOf(socket)) }));
    });
  });
}
