import Fastify, { type FastifyInstance } from 'fastify';
import { authRoutes } from './auth/authRoutes.js';
import { GoogleAuthLibraryGateway } from './auth/GoogleAuthLibraryGateway.js';
import { GoogleClientProvider } from './auth/GoogleClientProvider.js';
import type { GoogleOAuthGateway } from './auth/GoogleOAuthGateway.js';
import { createRequireTeacher } from './auth/requireTeacher.js';
import { TeacherAuth } from './auth/TeacherAuth.js';
import type { AppConfig } from './config.js';
import { errorHandler } from './http/errors.js';
import { loggerOptions } from './logger.js';

declare module 'fastify' {
  interface FastifyInstance {
    // 003, 006: `app.googleClients.authorizedClient()` before every Google call.
    googleClients: GoogleClientProvider;
  }
}

// Substitutes injected by tests. 003–006 may add their own (e.g. `spreadsheetReader`).
export interface AppDeps {
  gateway?: GoogleOAuthGateway;
  logStream?: { write(line: string): void };
}

// Server composition root. 003–006 register their routes here with `app.register(...)`.
export function buildApp(config: AppConfig, deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: { ...loggerOptions, stream: deps.logStream } });
  app.setErrorHandler(errorHandler);

  const gateway = deps.gateway ?? (config.google ? new GoogleAuthLibraryGateway(config.google) : unconfiguredGateway);
  const googleClients = new GoogleClientProvider(gateway);
  const teacherAuth = new TeacherAuth(gateway, googleClients, app.log);
  app.decorate('requireTeacher', createRequireTeacher(teacherAuth));
  app.decorate('googleClients', googleClients);

  app.register(authRoutes, { config, teacherAuth, googleClients });
  // Registered by a later task: Socket.IO (T042).

  return app;
}

// Without Google config the auth routes answer 503 GOOGLE_NOT_CONFIGURED before reaching the gateway.
const unconfiguredGateway: GoogleOAuthGateway = {
  exchangeCode: () => Promise.reject(new Error('Google is not configured')),
  createClient: () => {
    throw new Error('Google is not configured');
  },
};
