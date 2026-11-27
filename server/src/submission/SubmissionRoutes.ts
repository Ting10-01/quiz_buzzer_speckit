import type { FastifyPluginAsync } from 'fastify';
import { sendError } from '../http/errors.js';
import type { SubmissionStore } from './SubmissionStore.js';

export interface SubmissionRoutesOptions {
  submissions: SubmissionStore;
}

// The teacher's submission routes (contracts/submission-api.md section 3). Teacher only.
// POST /api/questions/:n/judgements is added by US2 (T022).
export const submissionHttpRoutes: FastifyPluginAsync<SubmissionRoutesOptions> = async (app, { submissions }) => {
  const teacherOnly = { preHandler: app.requireTeacher };

  app.get<{ Params: { n: string } }>('/api/questions/:n/submissions', teacherOnly, async (request, reply) => {
    const n = questionNumber(request.params.n);
    if (n === null) return sendError(reply, 400, 'INVALID_QUESTION_NUMBER', '題號格式不正確');
    return submissions.list(n);
  });
};

/** A positive whole number, or null. */
function questionNumber(value: string): number | null {
  return /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}
