import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AppConfig, GoogleConfig } from '../../src/config.js';
import type { SpreadsheetReader } from '../../src/guided-notes/SpreadsheetReader.js';
import { FakeGoogleGateway } from './fakeGoogleGateway.js';
import { LogCapture } from './logCapture.js';

// Values are fake and deliberately unlike real Google keys (see T056).
export const TEST_GOOGLE_CONFIG: GoogleConfig = {
  clientId: 'test-client-id.apps.googleusercontent.com',
  clientSecret: 'test-client-secret-value',
  apiKey: 'test-picker-api-key-value',
  appId: '123456789012',
};

export interface TestApp {
  app: FastifyInstance;
  config: AppConfig;
  gateway: FakeGoogleGateway;
  logs: LogCapture;
}

export interface TestAppOptions {
  google?: GoogleConfig | null;
  gateway?: FakeGoogleGateway;
  // 003: replaces GoogleSheetsReader (e.g. tests/guided-notes/helpers/fakeSpreadsheetReader.ts).
  spreadsheetReader?: SpreadsheetReader;
  // Runs before app.ready(), e.g. to register a test-only route.
  beforeReady?: (app: FastifyInstance) => void;
}

// buildApp with a fake Google gateway and captured logs; use `app.inject` for HTTP tests.
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const google = options.google === undefined ? { ...TEST_GOOGLE_CONFIG } : options.google;
  const config: AppConfig = {
    port: 0,
    google,
    missingGoogleVars: google ? [] : ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_API_KEY', 'GOOGLE_APP_ID'],
  };
  const gateway = options.gateway ?? new FakeGoogleGateway();
  const logs = new LogCapture();
  const app = buildApp(config, {
    gateway,
    logStream: logs,
    spreadsheetReader: options.spreadsheetReader,
  });
  options.beforeReady?.(app);
  await app.ready();
  return { app, config, gateway, logs };
}

// Same as createTestApp, but listening on a random local port (for Socket.IO tests).
export async function listenTestApp(options: TestAppOptions = {}): Promise<TestApp & { url: string }> {
  const testApp = await createTestApp(options);
  await testApp.app.listen({ host: '127.0.0.1', port: 0 });
  const address = testApp.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server is not listening on a port');
  return { ...testApp, url: `http://127.0.0.1:${address.port}` };
}
