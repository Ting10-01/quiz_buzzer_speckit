import type { FastifyRequest } from 'fastify';

// The single logger configuration for the server (research RD-07).
// 003–006: add any new sensitive field to `redact.paths` here; do not create other loggers.
export const loggerOptions = {
  level: 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.teacherToken',
      '*.accessToken',
      '*.refreshToken',
      '*.access_token',
      '*.refresh_token',
      '*.id_token',
      '*.code',
      '*.clientSecret',
      '*.apiKey',
      // 004: a student's identity (research RA-12).
      '*.studentToken',
    ],
    censor: '[Redacted]',
  },
  serializers: {
    // Headers are logged so that `req.headers.*` redaction is observable; bodies are never logged.
    req: (req: FastifyRequest) => ({ method: req.method, url: req.url, headers: req.headers }),
  },
};
