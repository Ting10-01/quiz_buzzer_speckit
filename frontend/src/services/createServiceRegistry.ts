// Composition root: the only place that binds interfaces to implementations and the only
// file allowed to import services/mock (principle III, enforced by ESLint).
// Later sub-features replace a mock by changing its binding here (plan "替換模擬實作的方式").
import { ActivityPhase, type Activity } from '@quiz-buzzer/shared/entities';
import { isImportSuccess } from '@quiz-buzzer/shared/guards';
import { GooglePickerLauncher } from './google/GooglePickerLauncher';
import { ApiClient } from './http/ApiClient';
import { GisGoogleIdentityClient } from './http/GisGoogleIdentityClient';
import { HttpAuthService } from './http/HttpAuthService';
import { HttpGuidedNotesService } from './http/HttpGuidedNotesService';
import { TeacherCredentialStore } from './http/TeacherCredentialStore';
import { HttpActivityService } from './HttpActivityService';
import { MockFixtures } from './mock/MockFixtures';
import { MockResultService } from './mock/MockResultService';
import { MockSession } from './mock/MockSession';
import { MockSubmissionService } from './mock/MockSubmissionService';
import type { GuidedNotesService } from './interfaces';
import { RealtimeClient } from './RealtimeClient';
import type { ServiceRegistry } from './ServiceRegistry';

type ServiceKey = 'auth' | 'guidedNotes' | 'activity' | 'submission' | 'result';

/** Creates one registry per tab; the submission and result mocks in it share one MockSession. */
export function createServiceRegistry(): ServiceRegistry {
  const session = new MockSession();
  const submission = new MockSubmissionService(session);
  const credentials = new TeacherCredentialStore();
  const api = new ApiClient(credentials);
  // 002, 003 and 004: auth, guidedNotes and activity are real; their mocks stay for tests only.
  const mockBound = new Set<ServiceKey>(['submission', 'result']);
  const httpGuidedNotes = new HttpGuidedNotesService(api, new GooglePickerLauncher(api));
  // ponytail: the result mock builds on session.lastImport in the teacher tab; hand it the real
  // import. Drop this wrapper once 006 replaces that mock.
  const guidedNotes: GuidedNotesService = {
    pickSpreadsheet: () => httpGuidedNotes.pickSpreadsheet(),
    async readWorksheet(spreadsheetId, worksheet) {
      const result = await httpGuidedNotes.readWorksheet(spreadsheetId, worksheet);
      if (isImportSuccess(result)) session.lastImport = result;
      return result;
    },
  };

  // One WebSocket connection per tab; the server sends the current activity on connect (004).
  const realtime = new RealtimeClient(credentials);
  const activity = new HttpActivityService(realtime, api);
  bridgeMocksToActivity(session, submission, activity);
  realtime.connect();

  return {
    auth: new HttpAuthService(new GisGoogleIdentityClient(), api, credentials),
    guidedNotes,
    activity,
    submission,
    result: new MockResultService(session),
    judgementControl: submission,
    teammateControl: submission,
    submissionValidationControl: submission,
    unexpectedErrorControl: session,
    isMockMode: () => mockBound.size > 0,
  };
}

/**
 * ponytail (004 research RA-14): until 005 and 006 replace the submission and result mocks, they
 * read MockSession, so keep it in step with the real activity and this tab's group. Drop this once
 * those mocks are gone.
 */
function bridgeMocksToActivity(session: MockSession, submission: MockSubmissionService, activity: HttpActivityService): void {
  const follow = (current: Activity) => {
    session.teacherActivity = current;
    // The mock's "which question is the student on" (M7) follows the real phase.
    const step = MockFixtures.viewerSequence.findIndex(
      (s) =>
        s.phase === current.phase &&
        (current.phase === ActivityPhase.PREPARING || current.phase === ActivityPhase.FINISHED || s.currentQuestion === current.currentQuestion),
    );
    if (step >= 0) session.viewerPhaseIndex = step;
  };
  activity.onActivityChange(follow);
  activity.onPhaseChange((current) => {
    if (current) return follow(current);
    // The activity was cancelled (001 RD-12).
    session.teacherActivity = undefined;
    session.joinedGroup = undefined;
    session.viewerPhaseIndex = 0;
  });

  const joinGroup = activity.joinGroup.bind(activity);
  activity.joinGroup = async (groupNumber) => {
    const joined = await joinGroup(groupNumber);
    session.joinedGroup = groupNumber;
    return joined;
  };
  const leaveGroup = activity.leaveGroup.bind(activity);
  activity.leaveGroup = async () => {
    await leaveGroup();
    session.joinedGroup = undefined;
  };

  // Student tabs: the mock's 模擬：接受 no longer moves the phase; the real phase does (RA-14).
  session.setViewerPhaseAdvancer(() => {});

  // Teacher tabs: accepting in the mock judge ends the question on the server too, and the page
  // follows the server's activity.
  const judge = submission.judge.bind(submission);
  submission.judge = async (questionNumber, groupNumber, judgement) => {
    const outcome = await judge(questionNumber, groupNumber, judgement);
    if (outcome.activity.phase === ActivityPhase.OPEN) return outcome;
    return { ...outcome, activity: await activity.endQuestion(questionNumber) };
  };
}
