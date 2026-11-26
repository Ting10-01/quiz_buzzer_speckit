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
};
