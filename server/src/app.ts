import Fastify, { type FastifyInstance } from 'fastify';
import { createActivityModule } from './activity/index.js';
import { authRoutes } from './auth/authRoutes.js';
import { GoogleAuthLibraryGateway } from './auth/GoogleAuthLibraryGateway.js';
import { GoogleClientProvider } from './auth/GoogleClientProvider.js';
import type { GoogleOAuthGateway } from './auth/GoogleOAuthGateway.js';
import { createRequireTeacher } from './auth/requireTeacher.js';
import { TeacherAuth } from './auth/TeacherAuth.js';
import type { AppConfig } from './config.js';
import { GoogleSheetsReader } from './guided-notes/GoogleSheetsReader.js';
import { guidedNotesRoutes } from './guided-notes/guidedNotesRoutes.js';
import { ImportStore } from './guided-notes/ImportStore.js';
import type { SpreadsheetReader } from './guided-notes/SpreadsheetReader.js';
import { errorHandler } from './http/errors.js';
import { loggerOptions } from './logger.js';
import { attachSocketServer } from './realtime/socketServer.js';

declare module 'fastify' {
  interface FastifyInstance {
    // 003, 006: `app.googleClients.authorizedClient()` before every Google call.
    googleClients: GoogleClientProvider;
    // 003 writes it; 004 and 006 only read latest() / latestMarkers() (003 contracts/import-store.md).
    importStore: ImportStore;
    // 003, 006: reads a spreadsheet with the teacher's Google authorization.
    spreadsheetReader: SpreadsheetReader;
  }
}

// Substitutes injected by tests. 003–006 may add their own (e.g. `spreadsheetReader`).
export interface AppDeps {
  gateway?: GoogleOAuthGateway;
  logStream?: { write(line: string): void };
  spreadsheetReader?: SpreadsheetReader;
}

// Server composition root. 003–006 register their routes here with `app.register(...)`.
export function buildApp(config: AppConfig, deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({
    logger: { ...loggerOptions, stream: deps.logStream },
    // 003: spreadsheet ids in the path may be up to 200 characters (the default limit is 100),
    // so the route's schema, not the router, rejects an id that is too long.
    routerOptions: { maxParamLength: 256 },
  });
  app.setErrorHandler(errorHandler);

  const gateway = deps.gateway ?? (config.google ? new GoogleAuthLibraryGateway(config.google) : unconfiguredGateway);
  const googleClients = new GoogleClientProvider(gateway);
  const teacherAuth = new TeacherAuth(gateway, googleClients, app.log);
  app.decorate('requireTeacher', createRequireTeacher(teacherAuth));
  app.decorate('googleClients', googleClients);

  app.decorate('importStore', new ImportStore());
  app.decorate('spreadsheetReader', deps.spreadsheetReader ?? new GoogleSheetsReader(googleClients));

  app.register(authRoutes, { config, teacherAuth, googleClients });
  app.register(guidedNotesRoutes);
  attachSocketServer(app, teacherAuth);
  // 004: activity state, pushes and student group events on app.io.
  app.register(createActivityModule, { importStore: app.importStore });

  return app;
}

// Without Google config the auth routes answer 503 GOOGLE_NOT_CONFIGURED before reaching the gateway.
const unconfiguredGateway: GoogleOAuthGateway = {
  exchangeCode: () => Promise.reject(new Error('Google is not configured')),
  createClient: () => {
    throw new Error('Google is not configured');
  },
};
