import Fastify, { type FastifyInstance } from 'fastify';
import type { GoogleOAuthGateway } from './auth/GoogleOAuthGateway.js';
import type { AppConfig } from './config.js';
import { errorHandler } from './http/errors.js';
import { loggerOptions } from './logger.js';

// Substitutes injected by tests. 003–006 may add their own (e.g. `spreadsheetReader`).
export interface AppDeps {
  gateway?: GoogleOAuthGateway;
  logStream?: { write(line: string): void };
}

// Server composition root. 003–006 register their routes here with `app.register(...)`.
export function buildApp(config: AppConfig, deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: { ...loggerOptions, stream: deps.logStream } });
  app.setErrorHandler(errorHandler);

  // Registered by later tasks: requireTeacher (T027), authRoutes and app.googleClients (T028),
  // Socket.IO (T042).

  return app;
}
