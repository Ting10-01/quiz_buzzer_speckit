import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import type { ActivitySnapshot, GroupAck } from '@quiz-buzzer/shared/activitySync';
import type { Socket } from 'socket.io-client';
import { Audience, toActivity } from '../../src/activity/ActivityView.js';
import { snapshotsOf, startActivityTestServer, type ActivityTestServer } from '../helpers/activityTestServer.js';

// T045 (research RA-15): 1 teacher and 200 students (20 groups × 10, WebSocket only).
// AC-29 / NFR-02: 200 students join within 1 second; every join gets exactly one ack, the counts add up
// to 200 and the teacher sees the server's counts within 1 second of the last join.
// AC-28 / NFR-01: the teacher opens and ends 4 questions; every phase change reaches all 201 connections
// within 1 second, each connection's versions strictly increase, and every connection ends equal to the server.
//
// Run with `npm run test:load:activity -w server` (T046: 20 runs, SC-002), or once with
// `npx tsx tests/load/phaseSync.load.ts --runs 1` from server/.

const GROUP_COUNT = 20;
const STUDENTS_PER_GROUP = 10;
const STUDENT_COUNT = GROUP_COUNT * STUDENTS_PER_GROUP;
const QUESTION_COUNT = 4;
const CONNECT_BATCH = 50;
const DEADLINE_MS = 1000;
// How long to keep waiting after the deadline, so a late delivery is told apart from a missing one.
const GRACE_MS = 4000;

export interface RunReport {
  /** Joins that got no ack, more than one ack, or an error ack. */
  joinAckProblems: string[];
  /** Server member counts that are not 10 per group / 200 in total. */
  memberCountProblems: string[];
  /** ms from the last join ack to the teacher's snapshot with the server's counts (null: never). */
  teacherCountsDelayMs: number | null;
  /** Each phase change: the slowest delivery and the connections that got it late or never. */
  phaseChanges: { label: string; version: number; slowestMs: number; late: number; missing: number }[];
  /** Connections whose received versions went backwards or repeated. */
  versionProblems: number;
  /** Connections whose last snapshot differs from the server's state. */
  finalMismatches: number;
  /** Anything that stopped the run early (a command that failed, a connection that failed). */
  errors: string[];
}

interface Received {
  version: number;
  at: number;
}

export function failures(report: RunReport): string[] {
  const out: string[] = [...report.errors];
  if (report.joinAckProblems.length > 0) out.push(`join acks: ${report.joinAckProblems.length} problem(s), e.g. ${report.joinAckProblems[0]}`);
  if (report.memberCountProblems.length > 0) out.push(`member counts: ${report.memberCountProblems.join('; ')}`);
  if (report.teacherCountsDelayMs === null) out.push('teacher never received the server member counts');
  else if (report.teacherCountsDelayMs > DEADLINE_MS) out.push(`teacher counts arrived ${report.teacherCountsDelayMs.toFixed(0)} ms after the last join`);
  for (const change of report.phaseChanges) {
    if (change.late > 0 || change.missing > 0) {
      out.push(`${change.label} (v${change.version}): ${change.late} late, ${change.missing} missing`);
    }
  }
  if (report.phaseChanges.length < QUESTION_COUNT * 2 && report.errors.length === 0) {
    out.push(`only ${report.phaseChanges.length} of ${QUESTION_COUNT * 2} phase changes ran`);
  }
  if (report.versionProblems > 0) out.push(`${report.versionProblems} connection(s) with versions out of order`);
  if (report.finalMismatches > 0) out.push(`${report.finalMismatches} connection(s) differ from the server at the end`);
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

export async function runPhaseSyncLoad(): Promise<RunReport> {
  const report: RunReport = {
    joinAckProblems: [],
    memberCountProblems: [],
    teacherCountsDelayMs: null,
    phaseChanges: [],
    versionProblems: 0,
    finalMismatches: 0,
    errors: [],
  };
  const server: ActivityTestServer = await startActivityTestServer();
  const received = new Map<Socket, Received[]>();
  const teacherSnapshots: { snapshot: ActivitySnapshot; at: number }[] = [];

  function record(socket: Socket): Socket {
    const list: Received[] = [];
    received.set(socket, list);
    socket.on('activity:snapshot', (snapshot: ActivitySnapshot) => list.push({ version: snapshot.version, at: performance.now() }));
    return socket;
  }

  async function command(url: string, payload?: object): Promise<ActivitySnapshot> {
    const res = await server.app.inject({
      method: 'POST',
      url,
      payload,
      headers: { authorization: `Bearer ${server.teacherToken}` },
    });
    if (res.statusCode !== 200) throw new Error(`POST ${url} → ${res.statusCode} ${res.body}`);
    return res.json() as ActivitySnapshot;
  }

  try {
    const teacher = record(await server.connectTeacher());
    teacher.on('activity:snapshot', (snapshot: ActivitySnapshot) => teacherSnapshots.push({ snapshot, at: performance.now() }));
    // Connect in batches: 200 handshakes at once overflow the OS listen backlog (macOS somaxconn is 128)
    // and get ECONNRESET. The criteria are about 201 open connections, not about connecting at once.
    const students: Socket[] = [];
    while (students.length < STUDENT_COUNT) {
      const batch = Math.min(CONNECT_BATCH, STUDENT_COUNT - students.length);
      students.push(...(await Promise.all(Array.from({ length: batch }, () => server.connectStudent()))).map(record));
    }
    const everyone = [teacher, ...students];

    // Phase change: the command is sent at t0; every connection must receive its version by t0 + 1 s.
    async function phaseChange(label: string, url: string, payload?: object): Promise<void> {
      const t0 = performance.now();
      const { version } = await command(url, payload);
      const arrival = (socket: Socket) => received.get(socket)!.find((r) => r.version === version)?.at;
      await waitUntil(() => everyone.every((socket) => arrival(socket) !== undefined), DEADLINE_MS + GRACE_MS);
      let slowestMs = 0;
      let late = 0;
      let missing = 0;
      for (const socket of everyone) {
        const at = arrival(socket);
        if (at === undefined) {
          missing += 1;
          continue;
        }
        slowestMs = Math.max(slowestMs, at - t0);
        if (at - t0 > DEADLINE_MS) late += 1;
      }
      report.phaseChanges.push({ label, version, slowestMs, late, missing });
    }

    await command('/api/activity', { groupCount: GROUP_COUNT });

    // AC-29: all 200 joins are sent at once; each callback must run exactly once without an error.
    const ackCounts = new Array<number>(STUDENT_COUNT).fill(0);
    let lastAckAt = 0;
    students.forEach((student, i) => {
      student.emit('group:join', { groupNumber: (i % GROUP_COUNT) + 1 }, (ack: GroupAck) => {
        ackCounts[i]! += 1;
        lastAckAt = Math.max(lastAckAt, performance.now());
        if (ack.error) report.joinAckProblems.push(`student ${i}: ${ack.error.code} ${ack.error.message}`);
      });
    });
    await waitUntil(() => ackCounts.every((n) => n >= 1), DEADLINE_MS + GRACE_MS);
    // Give a duplicate ack a chance to show up before counting.
    await new Promise((resolve) => setTimeout(resolve, 100));
    ackCounts.forEach((n, i) => {
      if (n !== 1) report.joinAckProblems.push(`student ${i}: ${n} ack(s)`);
    });

    const serverCounts = server.app.activity.membership.memberCounts(GROUP_COUNT);
    const total = serverCounts.reduce((sum, n) => sum + n, 0);
    if (total !== STUDENT_COUNT) report.memberCountProblems.push(`total ${total}, expected ${STUDENT_COUNT}`);
    serverCounts.forEach((n, i) => {
      if (n !== STUDENTS_PER_GROUP) report.memberCountProblems.push(`group ${i + 1} has ${n}`);
    });

    const teacherHasServerCounts = () =>
      teacherSnapshots.find(({ snapshot }) =>
        isDeepStrictEqual(snapshot.activity?.groups.map((g) => g.memberCount), serverCounts),
      );
    await waitUntil(() => teacherHasServerCounts() !== undefined, DEADLINE_MS + GRACE_MS);
    const counted = teacherHasServerCounts();
    if (counted) report.teacherCountsDelayMs = Math.max(0, counted.at - lastAckAt);

    // AC-28: open and end every question in order.
    for (let n = 1; n <= QUESTION_COUNT; n += 1) {
      await phaseChange(`open ${n}`, `/api/activity/questions/${n}/open`);
      await phaseChange(`end ${n}`, `/api/activity/questions/${n}/end`);
    }

    // Versions on every connection strictly increase (the full history, including the first snapshot).
    for (const socket of everyone) {
      const versions = snapshotsOf(socket).map((s) => s.version);
      if (versions.some((v, i) => i > 0 && v <= versions[i - 1]!)) report.versionProblems += 1;
    }

    // Every connection's last snapshot is the server's state for its audience.
    const state = server.app.activity.store.current();
    const version = server.app.activity.store.version();
    const counts = state ? server.app.activity.membership.memberCounts(state.groupCount) : [];
    for (const socket of everyone) {
      const audience = socket === teacher ? Audience.TEACHER : Audience.PUBLIC;
      const expected: ActivitySnapshot = { version, activity: state && toActivity(state, counts, audience) };
      const last = snapshotsOf(socket).at(-1);
      if (!isDeepStrictEqual(last, expected)) report.finalMismatches += 1;
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await server.close();
  }
  return report;
}

function parseRuns(argv: string[]): number {
  const i = argv.indexOf('--runs');
  const runs = i >= 0 ? Number(argv[i + 1]) : 1;
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${argv[i + 1]}`);
  return runs;
}

// SC-002: repeat, print one line per run and a summary; exit 1 if any run failed.
async function main(): Promise<void> {
  const runs = parseRuns(process.argv.slice(2));
  let failedRuns = 0;
  let slowestMs = 0;
  let late = 0;
  let versionProblems = 0;
  let finalMismatches = 0;
  for (let run = 1; run <= runs; run += 1) {
    const report = await runPhaseSyncLoad();
    const problems = failures(report);
    const runSlowest = Math.max(0, ...report.phaseChanges.map((c) => c.slowestMs));
    slowestMs = Math.max(slowestMs, runSlowest);
    late += report.phaseChanges.reduce((sum, c) => sum + c.late + c.missing, 0);
    versionProblems += report.versionProblems;
    finalMismatches += report.finalMismatches;
    if (problems.length > 0) failedRuns += 1;
    const teacherMs = report.teacherCountsDelayMs === null ? '–' : report.teacherCountsDelayMs.toFixed(0);
    console.log(
      `run ${run}/${runs}: ${problems.length === 0 ? 'PASS' : 'FAIL'}` +
        ` | slowest phase change ${runSlowest.toFixed(0)} ms | teacher counts +${teacherMs} ms`,
    );
    for (const problem of problems) console.log(`  - ${problem}`);
  }
  console.log(
    `\nsummary: ${runs - failedRuns}/${runs} runs passed | slowest phase change ${slowestMs.toFixed(0)} ms` +
      ` | late or missing deliveries ${late} | version problems ${versionProblems} | final mismatches ${finalMismatches}`,
  );
  process.exitCode = failedRuns === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
