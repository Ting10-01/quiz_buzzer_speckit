import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { sendError } from '../http/errors.js';
import { ActivityRuleError, type ActivityManager } from './ActivityManager.js';

export interface ActivityRoutesOptions {
  manager: ActivityManager;
}

// Only "the body is an object": ActivityManager checks groupCount, so a bad value answers
// 200 ValidationError with its field instead of Fastify's schema error (contracts/activity-http.md).
const settingsSchema = { body: { type: 'object' } } as const;

/** Runs a command; a rule that does not allow it answers 409 { code, message }. */
function answer(reply: FastifyReply, command: () => unknown): unknown {
  try {
    return command();
  } catch (error) {
    if (error instanceof ActivityRuleError) return sendError(reply, 409, error.code, error.message);
    throw error;
  }
}

// The teacher's activity commands (contracts/activity-http.md). Teacher only.
export const activityRoutes: FastifyPluginAsync<ActivityRoutesOptions> = async (app, { manager }) => {
  const teacherOnly = { preHandler: app.requireTeacher };

  app.post<{ Body: { groupCount: number } }>(
    '/api/activity',
    { ...teacherOnly, schema: settingsSchema },
    async (request, reply) => answer(reply, () => manager.createActivity(request.body)),
  );

  app.put<{ Body: { groupCount: number } }>(
    '/api/activity/settings',
    { ...teacherOnly, schema: settingsSchema },
    async (request, reply) => answer(reply, () => manager.updateSettings(request.body)),
  );

  app.delete('/api/activity', teacherOnly, async (_request, reply) => answer(reply, () => manager.cancelActivity()));

  // :n that is not a whole number is a question that cannot be opened or ended (409).
  app.post<{ Params: { n: string } }>('/api/activity/questions/:n/open', teacherOnly, async (request, reply) => {
    const { n } = request.params;
    if (!isWholeNumber(n)) return sendError(reply, 409, 'QUESTION_NOT_NEXT', `現在不能開放第 ${n} 題`);
    return answer(reply, () => manager.openQuestion(Number(n)));
  });

  app.post<{ Params: { n: string } }>('/api/activity/questions/:n/end', teacherOnly, async (request, reply) => {
    const { n } = request.params;
    if (!isWholeNumber(n)) return sendError(reply, 409, 'QUESTION_NOT_OPEN', `第 ${n} 題目前沒有開放，不能結束`);
    return answer(reply, () => manager.endQuestion(Number(n)));
  });
};

function isWholeNumber(value: string): boolean {
  return /^\d{1,9}$/.test(value);
}
