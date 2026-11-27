// Composition root: the only place that binds interfaces to implementations and the only
// file allowed to import services/mock (principle III, enforced by ESLint).
// Later sub-features replace a mock by changing its binding here (plan "替換模擬實作的方式").
import { isImportSuccess } from '@quiz-buzzer/shared/guards';
import { GooglePickerLauncher } from './google/GooglePickerLauncher';
import { ApiClient } from './http/ApiClient';
import { GisGoogleIdentityClient } from './http/GisGoogleIdentityClient';
import { HttpAuthService } from './http/HttpAuthService';
import { HttpGuidedNotesService } from './http/HttpGuidedNotesService';
import { TeacherCredentialStore } from './http/TeacherCredentialStore';
import { HttpActivityService } from './HttpActivityService';
import { MockResultService } from './mock/MockResultService';
import { MockSession } from './mock/MockSession';
import type { GuidedNotesService } from './interfaces';
import { RealtimeClient } from './RealtimeClient';
import { ServerSubmissionService } from './server/ServerSubmissionService';
import type { ServiceRegistry } from './ServiceRegistry';

type ServiceKey = 'auth' | 'guidedNotes' | 'activity' | 'submission' | 'result';

/** Creates one registry per tab; the result mock in it runs on one MockSession. */
export function createServiceRegistry(): ServiceRegistry {
  const session = new MockSession();
  const credentials = new TeacherCredentialStore();
  const api = new ApiClient(credentials);
  // 002–005: auth, guidedNotes, activity and submission are real; their mocks stay for tests only.
  const mockBound = new Set<ServiceKey>(['result']);
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
  bridgeMocksToActivity(session, activity);
  realtime.connect();

  return {
    auth: new HttpAuthService(new GisGoogleIdentityClient(), api, credentials),
    guidedNotes,
    activity,
    submission: new ServerSubmissionService(realtime, api),
    result: new MockResultService(session),
    unexpectedErrorControl: session,
    isMockMode: () => mockBound.size > 0,
  };
}

/**
 * ponytail (004 research RA-14): until 006 replaces the result mock, it reads the activity from
 * MockSession, so keep it in step with the real one. Drop this once that mock is gone.
 */
function bridgeMocksToActivity(session: MockSession, activity: HttpActivityService): void {
  activity.onActivityChange((current) => {
    session.teacherActivity = current;
  });
  activity.onPhaseChange((current) => {
    // Undefined once the activity was cancelled (001 RD-12).
    session.teacherActivity = current ?? undefined;
  });
}
