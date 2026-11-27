import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Submission } from '@quiz-buzzer/shared/entities';
import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import {
  GROUP_SUBMITTED,
  SUBMISSIONS_CHANGED,
  SUBMIT,
  type GroupSubmitted,
  type SubmitReply,
  type SubmitRequest,
  type SubmissionsChanged,
} from '@quiz-buzzer/shared/submissionEvents';
import { io as connect, type Socket } from 'socket.io-client';
import { buildApp } from '../../src/app.js';
import { FakeGoogleGateway, signInFor } from '../helpers/fakeGoogleGateway.js';
import { fourQuestionImport } from '../helpers/activityTestServer.js';
import { TEST_GOOGLE_CONFIG } from '../helpers/testApp.js';

// T027 (research RD-10): 1 teacher and 200 students (20 groups × 10, WebSocket only) against a server in
// a child process whose pino log goes to a temporary file.
// AC-20 / NFR-01: 1,000 submissions arrive within 1 second, including the same requestId sent twice and
// several connections of one group racing; every submission gets exactly one ack, each group exactly one
// accepted submission (the one with the group's smallest log `seq`), teacher ranks 1..20, student ranks 0,
// and each student connection gets its own group's submission:groupSubmitted exactly once.
// AC-21 / NFR-02: ack latency p95 ≤ 1 s and max ≤ 2 s; the teacher list lags ≤ 1 s.
// AC-22: the teacher's last list, GET /api/questions/1/submissions and the log give the same ranks.
// AC-24 / NFR-04: one extra connection stops reading; everyone else's numbers stay in range.
//
// Run with `npm run test:load:submission -w server` (20 runs, SC-002 / SC-003), or once with
// `npx tsx tests/load/submission.load.ts --runs 1` from server/.

const GROUP_COUNT = 20;
const STUDENTS_PER_GROUP = 10;
const STUDENT_COUNT = GROUP_COUNT * STUDENTS_PER_GROUP;
const SENDS_PER_STUDENT = 5;
const SEND_COUNT = STUDENT_COUNT * SENDS_PER_STUDENT;
const SEND_WINDOW_MS = 1000;
const SEND_SLICES = 100;
const QUESTION = 1;
const CONNECT_BATCH = 50;
const P95_LIMIT_MS = 1000;
const MAX_LIMIT_MS = 2000;
const TEACHER_LAG_LIMIT_MS = 1000;
// How long to keep waiting after the limits, so a late reply is told apart from a missing one.
const GRACE_MS = 4000;
const TEACHER_CODE = 'load-submission-teacher-code';

export interface RunReport {
  /** Submissions that got no ack or more than one. */
  ackProblems: string[];
  /** Groups without exactly one accepted submission, or whose accepted one is not its first in the log. */
  acceptProblems: string[];
  /** Student-view ranks that are not 0 (acks and submission:groupSubmitted). */
  studentRankProblems: number;
  /** Student connections without exactly one submission:groupSubmitted of their own group. */
  groupSubmittedProblems: string[];
  /** Teacher list, GET list and log disagree, or the ranks are not 1..20. */
  rankProblems: string[];
  /** Log seq values that are missing, repeated or outside 1..SEND_COUNT. */
  logProblems: string[];
  /** Ack latency in ms over all submissions that were answered. */
  p95Ms: number;
  maxMs: number;
  /** ms from the last group's first ok ack to the teacher's first list with every group (null: never). */
  teacherLagMs: number | null;
  /** Accepted submissions in the teacher's last list. */
  accepted: number;
  /** Anything that stopped the run early. */
  errors: string[];
}

export function failures(report: RunReport): string[] {
  const out: string[] = [...report.errors];
  if (report.ackProblems.length > 0) out.push(`acks: ${report.ackProblems.length} problem(s), e.g. ${report.ackProblems[0]}`);
  for (const problem of report.acceptProblems) out.push(`accept: ${problem}`);
  if (report.studentRankProblems > 0) out.push(`${report.studentRankProblems} student-view submission(s) with rank ≠ 0`);
  if (report.groupSubmittedProblems.length > 0) {
    out.push(`groupSubmitted: ${report.groupSubmittedProblems.length} connection(s), e.g. ${report.groupSubmittedProblems[0]}`);
  }
  for (const problem of report.rankProblems) out.push(`ranks: ${problem}`);
  for (const problem of report.logProblems) out.push(`log: ${problem}`);
  if (report.p95Ms > P95_LIMIT_MS) out.push(`ack p95 ${report.p95Ms.toFixed(0)} ms > ${P95_LIMIT_MS} ms`);
  if (report.maxMs > MAX_LIMIT_MS) out.push(`ack max ${report.maxMs.toFixed(0)} ms > ${MAX_LIMIT_MS} ms`);
  if (report.teacherLagMs === null) out.push('teacher never received a list with every group');
  else if (report.teacherLagMs > TEACHER_LAG_LIMIT_MS) out.push(`teacher list lagged ${report.teacherLagMs.toFixed(0)} ms`);
  return out;
}

function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (condition()) return resolve(true);
      if (performance.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 5);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

// ---------------------------------------------------------------------------------------------------
// Child process: the real buildApp with Google faked, a 4-question import, pino written to `logPath`.

async function serve(logPath: string): Promise<void> {
  const log = createWriteStream(logPath);
  const gateway = new FakeGoogleGateway().set(TEACHER_CODE, signInFor('load.teacher@example.com'));
  const app = buildApp({ port: 0, google: TEST_GOOGLE_CONFIG, missingGoogleVars: [] }, { gateway, logStream: log });
  await app.ready();
  app.importStore.save(fourQuestionImport(), {});
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server is not listening on a port');
  process.on('SIGTERM', () => {
    void app.close().finally(() => log.end(() => process.exit(0)));
  });
  console.log(`LOAD_SERVER_PORT=${address.port}`);
}

interface ChildServer {
  url: string;
  logPath: string;
  stop(): Promise<void>;
}

function startChildServer(): Promise<ChildServer> {
  const dir = mkdtempSync(join(tmpdir(), 'submission-load-'));
  const logPath = join(dir, 'server.log');
  const child: ChildProcess = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--serve', logPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('child server did not start within 15 s')), 15_000);
    child.once('exit', (code) => reject(new Error(`child server exited early with ${code}`)));
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
      const match = /LOAD_SERVER_PORT=(\d+)/.exec(out);
      if (!match) return;
      clearTimeout(timer);
      resolve({
        url: `http://127.0.0.1:${match[1]}`,
        logPath,
        async stop() {
          child.kill('SIGTERM');
          await exited;
        },
      });
    });
  });
}

interface LogEntry {
  msg: string;
  seq?: number;
  groupNumber?: number;
  requestId?: string;
  rank?: number;
}

function readLog(logPath: string): LogEntry[] {
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry)
    .filter((entry) => typeof entry.msg === 'string' && entry.msg.startsWith('submission.'));
}

// ---------------------------------------------------------------------------------------------------
// Parent: the simulated classroom.

interface Send {
  student: number;
  group: number;
  requestId: string;
  sentAt?: number;
  acks: SubmitReply[];
  ackedAt?: number;
}

export async function runSubmissionLoad(): Promise<RunReport> {
  const report: RunReport = {
    ackProblems: [],
    acceptProblems: [],
    studentRankProblems: 0,
    groupSubmittedProblems: [],
    rankProblems: [],
    logProblems: [],
    p95Ms: 0,
    maxMs: 0,
    teacherLagMs: null,
    accepted: 0,
    errors: [],
  };
  const sockets: Socket[] = [];
  let server: ChildServer | undefined;
  let logPath: string | undefined;
  let pausedSocket: { destroy(): void } | undefined;
  // The paused connection never answers a close, so it is destroyed first; otherwise closing the server
  // waits out ws's 30-second close timeout.
  const disconnectAll = () => {
    pausedSocket?.destroy();
    for (const socket of sockets.splice(0)) socket.disconnect();
  };

  try {
    server = await startChildServer();
    const { url } = server;
    logPath = server.logPath;

    const signIn = await fetch(`${url}/api/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XmlHttpRequest' },
      body: JSON.stringify({ code: TEACHER_CODE }),
    });
    const teacherToken: unknown = ((await signIn.json()) as { teacherToken?: unknown }).teacherToken;
    if (typeof teacherToken !== 'string') throw new Error(`teacher sign-in failed: ${signIn.status}`);

    async function teacherRequest(method: string, path: string, body?: object): Promise<unknown> {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: { authorization: `Bearer ${teacherToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status !== 200) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
      return res.json();
    }

    function open(auth: Record<string, string>): Promise<Socket> {
      const socket = connect(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(socket);
      return new Promise((resolve, reject) => {
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    }

    const teacher = await open({ teacherToken });
    const teacherLists: { submissions: Submission[]; at: number }[] = [];
    teacher.on(SUBMISSIONS_CHANGED, (payload: SubmissionsChanged) => {
      if (payload.questionNumber === QUESTION) teacherLists.push({ submissions: payload.submissions, at: performance.now() });
    });

    // Connect in batches: 200 handshakes at once overflow the OS listen backlog (macOS somaxconn is 128).
    const students: Socket[] = [];
    while (students.length < STUDENT_COUNT) {
      const batch = Math.min(CONNECT_BATCH, STUDENT_COUNT - students.length);
      students.push(...(await Promise.all(Array.from({ length: batch }, () => open({})))));
    }
    const groupOf = (i: number) => (i % GROUP_COUNT) + 1;
    const groupSubmitted = students.map(() => [] as GroupSubmitted[]);
    students.forEach((student, i) => student.on(GROUP_SUBMITTED, (payload: GroupSubmitted) => groupSubmitted[i]!.push(payload)));

    await teacherRequest('POST', '/api/activity', { groupCount: GROUP_COUNT });
    const joins = await Promise.all(
      students.map((student, i) => student.timeout(5000).emitWithAck('group:join', { groupNumber: groupOf(i) }) as Promise<GroupAck>),
    );
    joins.forEach((ack, i) => {
      if (ack.error) throw new Error(`student ${i} could not join group ${groupOf(i)}: ${ack.error.message}`);
    });

    // AC-24: a 201st student in group 1 stops reading from its socket, so everything sent to it piles up.
    const slow = await open({});
    const slowAck = (await slow.timeout(5000).emitWithAck('group:join', { groupNumber: 1 })) as GroupAck;
    if (slowAck.error) throw new Error(`slow connection could not join: ${slowAck.error.message}`);
    const rawSocket = (slow.io.engine.transport as unknown as { ws?: { _socket?: { pause(): void; destroy(): void } } }).ws?._socket;
    if (!rawSocket) throw new Error('cannot reach the slow connection’s TCP socket to pause it');
    rawSocket.pause();
    pausedSocket = rawSocket;

    await teacherRequest('POST', `/api/activity/questions/${QUESTION}/open`);

    // 5 per student: one requestId twice (a resend) and three more; with 10 members per group, every
    // group has many connections racing for the same question. Shuffled, then spread over 1 second.
    const sends: Send[] = shuffle(
      students.flatMap((_, i) => {
        const ids = [`s${i}-a`, `s${i}-a`, `s${i}-b`, `s${i}-c`, `s${i}-d`];
        return ids.map((requestId) => ({ student: i, group: groupOf(i), requestId, acks: [] as SubmitReply[] }));
      }),
    );
    const perSlice = Math.ceil(SEND_COUNT / SEND_SLICES);
    const t0 = performance.now();
    for (let slice = 0; slice < SEND_SLICES; slice += 1) {
      const wait = t0 + (slice * SEND_WINDOW_MS) / SEND_SLICES - performance.now();
      if (wait > 0) await sleep(wait);
      for (const send of sends.slice(slice * perSlice, (slice + 1) * perSlice)) {
        const request: SubmitRequest = { questionNumber: QUESTION, answers: ['答案'], requestId: send.requestId };
        send.sentAt = performance.now();
        students[send.student]!.emit(SUBMIT, request, (reply: SubmitReply) => {
          send.acks.push(reply);
          send.ackedAt ??= performance.now();
        });
      }
    }

    await waitUntil(() => sends.every((s) => s.acks.length > 0), MAX_LIMIT_MS + GRACE_MS);
    // Let a duplicate ack, a late groupSubmitted and the last merged teacher list arrive before counting.
    await sleep(500);

    // Every submission: exactly one ack; latency over the answered ones.
    const latencies: number[] = [];
    sends.forEach((send, i) => {
      if (send.acks.length !== 1) report.ackProblems.push(`send ${i} (${send.requestId}): ${send.acks.length} ack(s)`);
      if (send.ackedAt !== undefined) latencies.push(send.ackedAt - send.sentAt!);
      for (const ack of send.acks) if (ack.submission && ack.submission.rank !== 0) report.studentRankProblems += 1;
    });
    latencies.sort((a, b) => a - b);
    report.p95Ms = percentile(latencies, 0.95);
    report.maxMs = latencies.at(-1) ?? 0;

    // Each group: exactly one distinct requestId answered ok.
    const acceptedId = new Map<number, string>();
    const firstOkAt = new Map<number, number>();
    for (let group = 1; group <= GROUP_COUNT; group += 1) {
      const ok = sends.filter((s) => s.group === group && s.acks[0]?.ok);
      const ids = new Set(ok.map((s) => s.requestId));
      if (ids.size !== 1) {
        report.acceptProblems.push(`group ${group}: ${ids.size} accepted requestId(s)`);
        continue;
      }
      acceptedId.set(group, [...ids][0]!);
      firstOkAt.set(group, Math.min(...ok.map((s) => s.ackedAt!)));
    }

    // Each student connection: exactly one submission:groupSubmitted, for its own group, rank 0.
    groupSubmitted.forEach((events, i) => {
      for (const { submission } of events) if (submission.rank !== 0) report.studentRankProblems += 1;
      if (events.length !== 1 || events[0]!.submission.groupNumber !== groupOf(i)) {
        report.groupSubmittedProblems.push(
          `student ${i} (group ${groupOf(i)}): ${events.length} event(s) for group(s) ${events.map((e) => e.submission.groupNumber).join(',') || '–'}`,
        );
      }
    });

    // Teacher: the last list has ranks 1..20, one per group; its lag after the last group's first ok ack.
    const lastList = teacherLists.at(-1)?.submissions ?? [];
    report.accepted = lastList.length;
    const ranks = lastList.map((s) => s.rank);
    if (ranks.join(',') !== Array.from({ length: GROUP_COUNT }, (_, i) => i + 1).join(',')) {
      report.rankProblems.push(`teacher ranks ${ranks.join(',') || '(none)'}`);
    }
    if (new Set(lastList.map((s) => s.groupNumber)).size !== GROUP_COUNT) {
      report.rankProblems.push(`teacher list has ${new Set(lastList.map((s) => s.groupNumber)).size} distinct groups`);
    }
    const complete = teacherLists.find((l) => l.submissions.length === GROUP_COUNT);
    if (complete && firstOkAt.size === GROUP_COUNT) {
      report.teacherLagMs = Math.max(0, complete.at - Math.max(...firstOkAt.values()));
    }

    // AC-22: teacher list = GET list = log (rank → group).
    const listed = (await teacherRequest('GET', `/api/questions/${QUESTION}/submissions`)) as Submission[];
    const order = (list: { rank?: number; groupNumber?: number }[]) =>
      [...list].sort((a, b) => a.rank! - b.rank!).map((s) => `${s.rank}:${s.groupNumber}`).join(' ');
    if (order(listed) !== order(lastList)) report.rankProblems.push(`GET list ${order(listed)} ≠ teacher list ${order(lastList)}`);

    // Read the log only after the child has flushed it and exited.
    disconnectAll();
    await server.stop();
    server = undefined;
    const entries = readLog(logPath);

    // No submission lost: every processed one is logged once, seq 1..SEND_COUNT without gaps.
    const seqs = entries.map((e) => e.seq).filter((seq): seq is number => typeof seq === 'number').sort((a, b) => a - b);
    if (seqs.join(',') !== Array.from({ length: SEND_COUNT }, (_, i) => i + 1).join(',')) {
      const missing = SEND_COUNT - new Set(seqs.filter((seq) => seq >= 1 && seq <= SEND_COUNT)).size;
      report.logProblems.push(`${seqs.length} seq value(s) logged for ${SEND_COUNT} submissions, ${missing} of 1..${SEND_COUNT} missing`);
    }

    // AC-20: each group's accepted requestId is its smallest seq in the log.
    const accepted = entries.filter((e) => e.msg === 'submission.accepted');
    for (const [group, requestId] of acceptedId) {
      const ofGroup = entries.filter((e) => e.groupNumber === group && typeof e.seq === 'number');
      const first = ofGroup.reduce<LogEntry | undefined>((min, e) => (min === undefined || e.seq! < min.seq! ? e : min), undefined);
      if (first?.msg !== 'submission.accepted' || first.requestId !== requestId) {
        report.acceptProblems.push(
          `group ${group}: accepted ${requestId}, log's first is ${first ? `${first.msg} ${first.requestId ?? '?'} (seq ${first.seq})` : 'missing'}`,
        );
      }
    }

    // AC-22: log ranks = teacher ranks.
    if (order(accepted) !== order(lastList)) report.rankProblems.push(`log ${order(accepted) || '(none)'} ≠ teacher list ${order(lastList)}`);
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    disconnectAll();
    await server?.stop();
    if (logPath) rmSync(join(logPath, '..'), { recursive: true, force: true });
  }
  return report;
}

function parseRuns(argv: string[]): number {
  const i = argv.indexOf('--runs');
  const runs = i >= 0 ? Number(argv[i + 1]) : 1;
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${argv[i + 1]}`);
  return runs;
}

// SC-002 / SC-003: repeat, print one line per run (p95, max, accepted) and a summary; exit 1 if any run failed.
async function main(): Promise<void> {
  const runs = parseRuns(process.argv.slice(2));
  let failedRuns = 0;
  let worstP95 = 0;
  let worstMax = 0;
  for (let run = 1; run <= runs; run += 1) {
    const report = await runSubmissionLoad();
    const problems = failures(report);
    worstP95 = Math.max(worstP95, report.p95Ms);
    worstMax = Math.max(worstMax, report.maxMs);
    if (problems.length > 0) failedRuns += 1;
    const lag = report.teacherLagMs === null ? '–' : report.teacherLagMs.toFixed(0);
    console.log(
      `run ${run}/${runs}: ${problems.length === 0 ? 'PASS' : 'FAIL'}` +
        ` | ack p95 ${report.p95Ms.toFixed(0)} ms | max ${report.maxMs.toFixed(0)} ms` +
        ` | accepted ${report.accepted} | teacher lag ${lag} ms`,
    );
    for (const problem of problems) console.log(`  - ${problem}`);
  }
  console.log(
    `\nsummary: ${runs - failedRuns}/${runs} runs passed | worst ack p95 ${worstP95.toFixed(0)} ms | worst max ${worstMax.toFixed(0)} ms`,
  );
  process.exitCode = failedRuns === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const serveAt = process.argv.indexOf('--serve');
  if (serveAt >= 0) await serve(process.argv[serveAt + 1]!);
  else await main();
}
