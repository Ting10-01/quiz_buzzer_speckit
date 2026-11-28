// Server for the Playwright E2E tests (002 T022, 004 T061): the real app with Google replaced by a fake.
// Run with `npx tsx tests/e2e/startTestServer.ts`; listens on PORT (default 3000), where the
// Vite dev-server proxy forwards /api and /socket.io. PORT=0 picks a free port and prints it as
// `E2E_SERVER_PORT=<port>` (frontend/tests/e2e/testServer.ts starts one per Playwright worker).
import type { ImportSuccess } from '@quiz-buzzer/shared/entities';
import { isImportError } from '@quiz-buzzer/shared/guards';
import type { FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';
import { Audience } from '../../src/activity/ActivityView.js';
import { buildApp } from '../../src/app.js';
import { GuidedNotesParser } from '../../src/guided-notes/GuidedNotesParser.js';
import type { BlankMarkers } from '../../src/guided-notes/ImportStore.js';
import { loadConfig } from '../../src/config.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';
import { FakeSpreadsheetWriter } from '../helpers/FakeSpreadsheetWriter.js';
import { FakeSpreadsheetReader } from '../guided-notes/helpers/fakeSpreadsheetReader.js';
import { loadFixture } from '../guided-notes/helpers/gridBuilder.js';
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
 *   in the page (googlePicker.ts), so the result it showed is saved here for createActivity, with the
 *   blank cells and markers 003's parser finds in the same fixture (006 checks them on write-back, #34).
 * - GET /test/activity: the teacher snapshot, so walk helpers know the next phase step.
 * - GET /test/written: what 006's write-back sent to the fake Google Sheets (006 T032).
 */
function addTestRoutes(app: FastifyInstance, writer: FakeSpreadsheetWriter, reader: FakeSpreadsheetReader): void {
  app.post('/test/reset', async () => {
    const { queue, store, membership } = app.activity;
    queue.run(() => {
      membership.reset();
      store.commit(null);
    });
    writer.calls.splice(0);
    return { ok: true };
  });
  app.get('/test/written', async () => writer.calls);
  app.post<{ Body: ImportSuccess }>('/test/import', async (request) => {
    const { result, markers } = await withParsedBlankCells(reader, request.body);
    app.importStore.save(result, markers);
    return { ok: true };
  });
  app.get('/test/activity', async () => app.activity.manager.snapshot(Audience.TEACHER));
}

// The page's mock result keeps its question texts; the blank cells and markers come from 003's parser on
// the fixture of the same id, as a real import would give. Without a fixture the page's result is kept.
async function withParsedBlankCells(
  reader: FakeSpreadsheetReader,
  shown: ImportSuccess,
): Promise<{ result: ImportSuccess; markers: BlankMarkers }> {
  const { id, selectedWorksheet } = shown.spreadsheet;
  const grid = (await reader.load(id).catch(() => null))?.sheets.find((s) => s.name === selectedWorksheet);
  const parser = new GuidedNotesParser();
  const parsed = grid ? parser.parse(grid, shown.spreadsheet) : null;
  if (!grid || !parsed || isImportError(parsed)) return { result: shown, markers: {} };
  const result = structuredClone(shown);
  for (const question of result.questions) {
    const found = parsed.questions.find((q) => q.number === question.number);
    if (found) question.subQuestions = found.subQuestions;
  }
  return { result, markers: parser.markersOf(grid, parsed) };
}

export async function startTestServer(port: number) {
  const gateway = new FakeGoogleGateway()
    .set(E2E_CODES.teacherA, signInFor(E2E_ACCOUNTS.teacherA))
    .set(E2E_CODES.teacherB, signInFor(E2E_ACCOUNTS.teacherB))
    .set(E2E_CODES.noDriveScope, signInFor(E2E_ACCOUNTS.noDriveScope, ['openid', 'https://www.googleapis.com/auth/userinfo.email']))
    .set(E2E_CODES.pageTeacher, signInFor(E2E_ACCOUNTS.pageTeacher))
    .set(E2E_CODES.walkTeacher, signInFor(E2E_ACCOUNTS.walkTeacher));
  // 006: write-back reads the sheet again. 001's "題組＋單題範本" (the page's import, googlePicker.ts) has
  // the same question numbers as the "group" fixture, whose blank cells /test/import takes; its "單題範本" is read-only, like
  // in 001's mock (M8); any other sheet is not found.
  const spreadsheetReader = new FakeSpreadsheetReader()
    .set('group-and-single', loadFixture('group'))
    .set('single-only', loadFixture('single'), false);
  const spreadsheetWriter = new FakeSpreadsheetWriter();
  const app = buildApp(
    { port, google: TEST_GOOGLE_CONFIG, missingGoogleVars: [] },
    { gateway, spreadsheetReader, spreadsheetWriter },
  );
  addTestRoutes(app, spreadsheetWriter, spreadsheetReader);
  await app.listen({ host: '127.0.0.1', port });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT === '0' ? 0 : loadConfig(process.env).port;
  const app = await startTestServer(port);
  const address = app.server.address();
  if (address && typeof address !== 'string') console.log(`E2E_SERVER_PORT=${address.port}`);
}
