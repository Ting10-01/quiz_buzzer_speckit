import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../http/errors.js';
import type { TeacherAuth } from './TeacherAuth.js';

export type RequireTeacher = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;

declare module 'fastify' {
  interface FastifyInstance {
    // Teacher-only routes add `{ preHandler: app.requireTeacher }`; never parse Authorization yourself.
    requireTeacher: RequireTeacher;
  }
}

const BEARER_PREFIX = 'Bearer ';

// Only `Authorization: Bearer <teacherToken>` counts; cookies are never consulted (REQ-AUTH-06).
export function createRequireTeacher(teacherAuth: TeacherAuth): RequireTeacher {
  return async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
    if (!token || !teacherAuth.verify(token)) {
      return sendError(reply, 401, 'UNAUTHORIZED', '需要老師登入');
    }
  };
}
