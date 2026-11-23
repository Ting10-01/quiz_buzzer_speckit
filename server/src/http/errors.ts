import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

// Every error response body. `message` is Chinese text shown to the teacher.
export interface ErrorBody {
  code: string;
  message: string;
}

export function sendError(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  const body: ErrorBody = { code, message };
  return reply.status(status).send(body);
}

// Registered with `app.setErrorHandler` in buildApp.
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  // Log only code and message: library errors may carry request config with secrets.
  request.log.error({ code: error.code, message: error.message }, 'request failed');
  // Fastify's own client errors (malformed JSON, unsupported content type, body too large).
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return sendError(reply, error.statusCode, 'BAD_REQUEST', '請求格式錯誤');
  }
  return sendError(reply, 500, 'INTERNAL', '伺服器發生錯誤，請稍後再試');
}
