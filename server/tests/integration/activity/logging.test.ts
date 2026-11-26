import type { GroupAck } from '@quiz-buzzer/shared/activitySync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loggerOptions } from '../../../src/logger.js';
import { emitWithAck, startActivityTestServer, type ActivityTestServer } from '../../helpers/activityTestServer.js';

// T043: 004's log events (research RA-12) and no studentToken in the log (principle VI).
let server: ActivityTestServer;

beforeEach(async () => {
  server = await startActivityTestServer();
});

afterEach(async () => {
  await server.close();
});

function teacher(method: 'POST' | 'DELETE', url: string, payload?: object) {
  return server.app.inject({ method, url, payload, headers: { authorization: `Bearer ${server.teacherToken}` } });
}

/** Log records for `event`, written either as the message or as an `event` field. */
function recordsOf(event: string): Record<string, unknown>[] {
  return server.logs.parsed().filter((line) => line.msg === event || line.event === event);
}

describe('activity logging', () => {
  it('logs every activity, question and group event (RA-12)', async () => {
    const student = await server.connectStudent();
    await teacher('POST', '/api/activity', { groupCount: 4 });
    await emitWithAck<GroupAck>(student, 'group:join', { groupNumber: 2 });
    await emitWithAck<GroupAck>(student, 'group:leave', {});
    await teacher('DELETE', '/api/activity');
    await teacher('POST', '/api/activity', { groupCount: 4 });
    await teacher('POST', '/api/activity/questions/1/open');
    await teacher('POST', '/api/activity/questions/1/end');

    for (const event of ['activity.created', 'activity.cancelled', 'question.opened', 'question.ended', 'group.joined', 'group.left']) {
      expect(recordsOf(event), event).not.toHaveLength(0);
    }
    expect(recordsOf('activity.created')).toHaveLength(2);
    expect(JSON.stringify(recordsOf('question.opened'))).toContain('1');
  });

  it('never writes a studentToken to the log, including on reconnect (principle VI)', async () => {
    await teacher('POST', '/api/activity', { groupCount: 4 });
    const student = await server.connectStudent();
    const { studentToken } = await emitWithAck<GroupAck>(student, 'group:join', { groupNumber: 1 });
    expect(studentToken).toEqual(expect.any(String));
    student.disconnect();

    const again = await server.connectStudent(studentToken);
    await emitWithAck<GroupAck>(again, 'group:join', { groupNumber: 1 });
    await teacher('POST', '/api/activity/questions/1/open');

    expect(recordsOf('group.joined')).not.toHaveLength(0);
    expect(server.logs.text).not.toContain(studentToken!);
  });

  it('redacts any studentToken field (loggerOptions.redact.paths)', () => {
    expect(loggerOptions.redact.paths).toContain('*.studentToken');
  });
});
