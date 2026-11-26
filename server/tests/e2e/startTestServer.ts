// Server for the Playwright E2E tests (002 T022, 004 T061): the real app with Google replaced by a fake.
// Run with `npx tsx tests/e2e/startTestServer.ts`; listens on PORT (default 3000), where the
// Vite dev-server proxy forwards /api and /socket.io. PORT=0 picks a free port and prints it as
// `E2E_SERVER_PORT=<port>` (frontend/tests/e2e/testServer.ts starts one per Playwright worker).
import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import type { FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';
import { Audience } from '../../src/activity/ActivityView.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';
import { TEST_GOOGLE_CONFIG } from '../helpers/testApp.js';

// Codes the E2E GIS stub hands back from the "Google" popup.
export const E2E_CODES = {
  teacherA: 'e2e-code-teacher-a',
  teacherB: 'e2e-code-teacher-b',
  noDriveScope: 'e2e-code-no-drive-scope',
  // 001's page walks (frontend/tests/e2e/googleSignIn.ts) and the walk helpers' own teacher (T061).
  pageTeacher: 'e2e-code',
  walkTeacher: 'e2e-code-walk-teacher',
} as const;

export const E2E_ACCOUNTS = {
  teacherA: 'teacher.a@example.com',
  teacherB: 'teacher.b@example.com',
  noDriveScope: 'no.drive@example.com',
  pageTeacher: 'teacher@example.com',
  walkTeacher: 'walk.teacher@example.com',
} as const;

/**
 * Test-only routes, never part of the product (T061):
 * - POST /test/reset: no activity and no group members, so every test starts the same way.
 * - POST /test/import: stands in for 003's import; the page's Picker and import API are faked
 *   in the page (googlePicker.ts), so the result it showed is saved here for createActivity.
 * - GET /test/activity: the teacher snapshot, so walk helpers know the next phase step.
 */
function addTestRoutes(app: FastifyInstance): void {
  app.post('/test/reset', async () => {
    const { queue, store, membership } = app.activity;
    queue.run(() => {
      membership.reset();
      store.commit(null);
    });
    return { ok: true };
  });
  app.post<{ Body: ImportSuccess }>('/test/import', async (request) => {
    app.importStore.save(request.body, {});
    return { ok: true };
  });
  app.get('/test/activity', async () => app.activity.manager.snapshot(Audience.TEACHER));
}

export async function startTestServer(port: number) {
  const gateway = new FakeGoogleGateway()
    .set(E2E_CODES.teacherA, signInFor(E2E_ACCOUNTS.teacherA))
    .set(E2E_CODES.teacherB, signInFor(E2E_ACCOUNTS.teacherB))
    .set(E2E_CODES.noDriveScope, signInFor(E2E_ACCOUNTS.noDriveScope, ['openid', 'https://www.googleapis.com/auth/userinfo.email']))
    .set(E2E_CODES.pageTeacher, signInFor(E2E_ACCOUNTS.pageTeacher))
    .set(E2E_CODES.walkTeacher, signInFor(E2E_ACCOUNTS.walkTeacher));
  const app = buildApp({ port, google: TEST_GOOGLE_CONFIG, missingGoogleVars: [] }, { gateway });
  addTestRoutes(app);
  await app.listen({ host: '127.0.0.1', port });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT === '0' ? 0 : loadConfig(process.env).port;
  const app = await startTestServer(port);
  const address = app.server.address();
  if (address && typeof address !== 'string') console.log(`E2E_SERVER_PORT=${address.port}`);
}
