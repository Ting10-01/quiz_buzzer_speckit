// The real server with a fake Google gateway (server/tests/e2e/startTestServer.ts) for the E2E tests.
// - startTestServer(): own port 3100, for teacher-login.spec.ts (002).
// - connectTestServer(page): one server per Playwright worker on a free port (004 T061). Every page in
//   the browser context sends /api and Socket.IO there, so a running dev server is never used, and
//   the server is reset once per test, so each test starts with no activity.
import { spawn } from 'node:child_process';
import { test, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import type { ActivitySnapshot } from '@quiz-buzzer/shared/activitySync';
import type { ImportSuccess, JudgeOutcome } from '@quiz-buzzer/shared/entities';
import { SUBMIT, type SubmitReply } from '@quiz-buzzer/shared/submissionEvents';
import { io } from 'socket.io-client';

export const TEST_SERVER = 'http://127.0.0.1:3100';

/** Resolves once the server answers; the returned function stops it. */
export async function startTestServer(): Promise<() => void> {
  // node --import tsx runs the TypeScript entry in one process, so kill() stops the whole server.
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/e2e/startTestServer.ts'], {
    cwd: '../server',
    env: { ...process.env, PORT: '3100' },
    stdio: 'ignore',
  });
  const stop = () => {
    child.kill();
  };
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${TEST_SERVER}/api/auth/config`)).ok) return stop;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  stop();
  throw new Error('the fake-Google test server did not start within 20 seconds');
}

// ----- one server per worker (T061) -----

let workerServer: Promise<string> | undefined;
let currentUrl: string | undefined;
let lastResetTest: string | undefined;
const routedContexts = new WeakSet<BrowserContext>();
const framesByContext = new WeakMap<BrowserContext, string[]>();
/** Socket.IO events the pages of a browser context send that never reach the server (005 T041). */
const droppedByContext = new WeakMap<BrowserContext, Set<string>>();

function spawnWorkerServer(): Promise<string> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/e2e/startTestServer.ts'], {
    cwd: '../server',
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  process.on('exit', () => child.kill());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the E2E test server did not start within 20 seconds')), 20_000);
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
      const port = /E2E_SERVER_PORT=(\d+)/.exec(output)?.[1];
      if (!port) return;
      clearTimeout(timer);
      resolve(`http://127.0.0.1:${port}`);
    });
    child.on('exit', () => reject(new Error('the E2E test server exited before listening')));
  });
}

/**
 * Bridges the page's Socket.IO WebSocket to the test server. Playwright cannot point a routed
 * WebSocket at another URL, so the page side is answered here and relayed over Node's WebSocket.
 * Every frame the server sends is kept for socketFramesOf().
 */
function bridgeWebSocket(ws: WebSocketRoute, serverUrl: string, frames: string[], dropped = new Set<string>()): void {
  const target = new URL(ws.url());
  const server = new WebSocket(`${serverUrl.replace('http', 'ws')}${target.pathname}${target.search}`);
  const pending: string[] = [];
  server.onopen = () => {
    for (const message of pending.splice(0)) server.send(message);
  };
  server.onmessage = (event: MessageEvent) => {
    const message = String(event.data);
    frames.push(message);
    ws.send(message);
  };
  server.onclose = () => void ws.close();
  ws.onMessage((message) => {
    const text = String(message);
    // A Socket.IO event frame is 42[ack id]["event", payload].
    if ([...dropped].some((event) => text.startsWith('42') && text.includes(`["${event}"`))) return;
    if (server.readyState === WebSocket.OPEN) server.send(text);
    else pending.push(text);
  });
  ws.onClose(() => server.close());
}

/**
 * Sends the page's Socket.IO connection to a server started by the spec itself, like
 * teacher-login.spec.ts's startTestServer(); without it Socket.IO goes through Vite's proxy (004 T065).
 */
export async function routeSocketIo(page: Page, serverUrl: string): Promise<void> {
  await page.routeWebSocket(/\/socket\.io\//, (ws) => bridgeWebSocket(ws, serverUrl, []));
}

/**
 * Starts (once per worker) this worker's test server and resets it once per test, and sends every
 * /api request and Socket.IO connection of the page's browser context to it. Call before the first
 * page.goto; call again for a page in another browser context.
 */
export async function connectTestServer(page: Page): Promise<string> {
  workerServer ??= spawnWorkerServer();
  const url = await workerServer;
  currentUrl = url;

  const { testId } = test.info();
  if (lastResetTest !== testId) {
    lastResetTest = testId;
    walkTeacherToken = undefined;
    await fetch(`${url}/test/reset`, { method: 'POST' });
  }

  const context = page.context();
  if (routedContexts.has(context)) return url;
  routedContexts.add(context);
  const frames: string[] = [];
  framesByContext.set(context, frames);
  const dropped = new Set<string>();
  droppedByContext.set(context, dropped);

  await context.route('**/api/**', (route) => {
    const target = new URL(route.request().url());
    return route.continue({ url: `${url}${target.pathname}${target.search}` });
  });
  await context.routeWebSocket(/\/socket\.io\//, (ws) => bridgeWebSocket(ws, url, frames, dropped));
  return url;
}

/**
 * No activity and no group members again. A student walk starts with this, like 001's mock, which
 * started from no activity on every page load (004 T061).
 */
export async function resetTestServer(): Promise<void> {
  await fetch(`${testServerUrl()}/test/reset`, { method: 'POST' });
}

/** Every Socket.IO frame the server has sent to pages of this browser context so far. */
export function socketFramesOf(context: BrowserContext): string[] {
  return [...(framesByContext.get(context) ?? [])];
}

/**
 * The server stops receiving `event` from the pages of this browser context, as if it were down; the
 * page's emitWithAck times out (005 T041). Returns a function that undoes it.
 */
export function dropSocketEvent(context: BrowserContext, event: string): () => void {
  const dropped = droppedByContext.get(context);
  if (!dropped) throw new Error('connectTestServer(page) has not run for this browser context');
  dropped.add(event);
  return () => dropped.delete(event);
}

/** Whether connectTestServer() has run in the current test. */
function connectedInThisTest(): boolean {
  return currentUrl !== undefined && lastResetTest === test.info().testId;
}

/** This worker's test server, once connectTestServer() has run in the current test. */
export function testServerUrl(): string {
  if (!connectedInThisTest()) throw new Error('connectTestServer(page) has not run in this test');
  return currentUrl!;
}

/**
 * Stands in for 003's import on the server: the page's import API is faked (googlePicker.ts).
 * Nothing to do in a test with its own server (teacher-login.spec.ts).
 */
export async function seedImport(result: ImportSuccess): Promise<void> {
  if (!connectedInThisTest()) return;
  await fetch(`${testServerUrl()}/test/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(result),
  });
}

/** One call 006's write-back made to the test server's fake Google Sheets (server FakeSpreadsheetWriter). */
export interface SheetWrite {
  method: 'duplicateSheet' | 'writeTexts';
  spreadsheetId: string;
  cells?: { cell: string; text: string }[];
}

/** What the write-back sent to the fake Google Sheets in this test, in order (006 T032). */
export async function writtenToSheet(): Promise<SheetWrite[]> {
  return (await fetch(`${testServerUrl()}/test/written`)).json() as Promise<SheetWrite[]>;
}

/** The server's activity as the teacher sees it. */
export async function serverActivity(): Promise<ActivitySnapshot> {
  return (await fetch(`${testServerUrl()}/test/activity`)).json() as Promise<ActivitySnapshot>;
}

// ----- the walk helpers' own teacher (no teacher page is opened) -----

// Same code and account as E2E_CODES.walkTeacher in server/tests/e2e/startTestServer.ts.
const WALK_TEACHER_CODE = 'e2e-code-walk-teacher';
let walkTeacherToken: string | undefined;

async function signInWalkTeacher(): Promise<string> {
  const res = await fetch(`${testServerUrl()}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XmlHttpRequest' },
    body: JSON.stringify({ code: WALK_TEACHER_CODE }),
  });
  const { teacherToken } = (await res.json()) as { teacherToken?: string };
  if (!teacherToken) throw new Error(`walk teacher sign-in failed (${res.status})`);
  return teacherToken;
}

/** Calls 004's teacher API as the walk teacher; signs in again once if the credential was replaced. */
export async function teacherApi<T>(method: string, path: string, body?: object): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    walkTeacherToken ??= await signInWalkTeacher();
    const res = await fetch(`${testServerUrl()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${walkTeacherToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt === 0) {
      walkTeacherToken = undefined;
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
  throw new Error(`${method} ${path} was refused`);
}

/**
 * One step of the phase, like 001's mock M7: no activity → PREPARING (created from `source`) →
 * OPEN(1) → QUESTION_ENDED(1) → … → OPEN(last) → FINISHED; nothing happens after FINISHED.
 */
export async function advanceActivity(source: ImportSuccess, groupCount = 6): Promise<void> {
  const { activity } = await serverActivity();
  if (!activity) {
    await seedImport(source);
    await teacherApi('POST', '/api/activity', { groupCount });
    return;
  }
  const n = activity.currentQuestion ?? 0;
  if (activity.phase === 'PREPARING') await teacherApi('POST', '/api/activity/questions/1/open');
  else if (activity.phase === 'OPEN') await teacherApi('POST', `/api/activity/questions/${n}/end`);
  else if (activity.phase === 'QUESTION_ENDED') await teacherApi('POST', `/api/activity/questions/${n + 1}/open`);
}

/**
 * Sends the next "建立活動" or "儲存設定" with this group count instead of the page's, as someone
 * bypassing the page would (004 AC-04). The page cannot enter it, since "−" and "+" stop at 2 and
 * 20 (001 C2).
 */
export async function bypassGroupCountOnce(page: Page, groupCount: number): Promise<void> {
  await page.route(
    /\/api\/activity(\/settings)?$/,
    (route) => {
      if (!['POST', 'PUT'].includes(route.request().method())) return route.fallback();
      return route.fallback({ postData: JSON.stringify({ ...route.request().postDataJSON(), groupCount }) });
    },
    { times: 1 },
  );
}

// ----- another student of a group (005 T041) -----

/**
 * Another tab of `groupNumber` submits the open question through the test server, like 001's
 * "模擬：同組組員送出": a separate WebSocket connection joins the group and sends submission:submit.
 * Fills every sub-question unless `answers` is given. Rejects unless the server accepts it.
 */
export async function groupmateSubmits(groupNumber: number, answers?: string[]): Promise<SubmitReply> {
  const { activity } = await serverActivity();
  const questionNumber = activity?.phase === 'OPEN' ? activity.currentQuestion : undefined;
  const question = activity?.questions.find((q) => q.number === questionNumber);
  if (!question || questionNumber === undefined) throw new Error('no question is open on the test server');

  const socket = io(testServerUrl(), { transports: ['websocket'], forceNew: true, reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    await socket.timeout(3000).emitWithAck('group:join', { groupNumber });
    const reply = (await socket.timeout(3000).emitWithAck(SUBMIT, {
      questionNumber,
      answers: answers ?? question.subQuestions.map((_, i) => `組員答案${i + 1}`),
      requestId: `groupmate-${groupNumber}-${questionNumber}-${Date.now()}`,
    })) as SubmitReply;
    if (!reply.ok) throw new Error(`the groupmate's submission was refused: ${reply.error?.message}`);
    return reply;
  } finally {
    socket.disconnect();
  }
}

// ----- the teacher's judgement (005 T043) -----

/**
 * The walk teacher judges `groupNumber`'s submission of the open question through the test server's
 * POST /api/questions/:n/judgements, like 001's "模擬：接受" / "模擬：不接受" on a student tab.
 * Only for student walks: signing in the walk teacher voids a teacher page's credential.
 */
export async function judgeGroup(groupNumber: number, judgement: 'ACCEPTED' | 'REJECTED'): Promise<JudgeOutcome> {
  const { activity } = await serverActivity();
  if (activity?.phase !== 'OPEN' || activity.currentQuestion === undefined) throw new Error('no question is open on the test server');
  return teacherApi<JudgeOutcome>('POST', `/api/questions/${activity.currentQuestion}/judgements`, { groupNumber, judgement });
}
