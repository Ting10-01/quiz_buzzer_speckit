// Server for the Playwright E2E tests (002 T022): the real app with Google replaced by a fake.
// Run with `npx tsx tests/e2e/startTestServer.ts`; listens on PORT (default 3000), where the
// Vite dev-server proxy forwards /api and /socket.io.
import { pathToFileURL } from 'node:url';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';
import { TEST_GOOGLE_CONFIG } from '../helpers/testApp.js';

// Codes the E2E GIS stub hands back from the "Google" popup.
export const E2E_CODES = {
  teacherA: 'e2e-code-teacher-a',
  teacherB: 'e2e-code-teacher-b',
  noDriveScope: 'e2e-code-no-drive-scope',
} as const;

export const E2E_ACCOUNTS = {
  teacherA: 'teacher.a@example.com',
  teacherB: 'teacher.b@example.com',
  noDriveScope: 'no.drive@example.com',
} as const;

export async function startTestServer(port: number) {
  const gateway = new FakeGoogleGateway()
    .set(E2E_CODES.teacherA, signInFor(E2E_ACCOUNTS.teacherA))
    .set(E2E_CODES.teacherB, signInFor(E2E_ACCOUNTS.teacherB))
    .set(E2E_CODES.noDriveScope, signInFor(E2E_ACCOUNTS.noDriveScope, ['openid', 'https://www.googleapis.com/auth/userinfo.email']));
  const app = buildApp({ port, google: TEST_GOOGLE_CONFIG, missingGoogleVars: [] }, { gateway });
  await app.listen({ host: '127.0.0.1', port });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startTestServer(loadConfig(process.env).port);
}
