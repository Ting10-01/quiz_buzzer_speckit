import type { JudgeOutcome } from '@quiz-buzzer/shared/entities';
import type { JudgeRequest } from '@quiz-buzzer/shared/submissionEvents';
import type { FastifyPluginAsync } from 'fastify';
import type { ActivityStore } from '../activity/ActivityStore.js';
import type { CommandQueue } from '../activity/CommandQueue.js';
import { sendError } from '../http/errors.js';
import type { SubmissionEngine } from './SubmissionEngine.js';
import type { SubmissionStore } from './SubmissionStore.js';

export interface SubmissionRoutesOptions {
  submissions: SubmissionStore;
  engine: SubmissionEngine;
  queue: CommandQueue;
  activityStore: ActivityStore;
}

// The teacher's submission routes (contracts/submission-api.md section 3). Teacher only.
export const submissionHttpRoutes: FastifyPluginAsync<SubmissionRoutesOptions> = async (
  app,
  { submissions, engine, queue, activityStore },
) => {
  const teacherOnly = { preHandler: app.requireTeacher };

  app.get<{ Params: { n: string } }>('/api/questions/:n/submissions', teacherOnly, async (request, reply) => {
    const n = questionNumber(request.params.n);
    if (n === null) return sendError(reply, 400, 'INVALID_QUESTION_NUMBER', '題號格式不正確');
    return submissions.list(n);
  });

  app.post<{ Params: { n: string } }>('/api/questions/:n/judgements', teacherOnly, async (request, reply) => {
    const n = questionNumber(request.params.n);
    const body = judgeRequest(request.body);
    // A bad :n is also INVALID_JUDGEMENT (contracts/submission-api.md section 3).
    if (n === null || body === null) return sendError(reply, 400, 'INVALID_JUDGEMENT', '判定的資料格式不正確');
    const outcome = queue.run((): JudgeOutcome | null =>
      activityStore.current() === null ? null : engine.judge(n, body.groupNumber, body.judgement),
    );
    if (outcome === null) return sendError(reply, 409, 'NO_ACTIVITY', '目前沒有活動');
    return outcome;
  });
};

/** A positive whole number, or null. */
function questionNumber(value: string): number | null {
  return /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}

/** { groupNumber: positive integer, judgement: ACCEPTED | REJECTED }, or null. */
function judgeRequest(body: unknown): JudgeRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { groupNumber, judgement } = body as Partial<Record<keyof JudgeRequest, unknown>>;
  if (typeof groupNumber !== 'number' || !Number.isInteger(groupNumber) || groupNumber < 1) return null;
  if (judgement !== 'ACCEPTED' && judgement !== 'REJECTED') return null;
  return { groupNumber, judgement };
}
