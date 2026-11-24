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
import { MockActivityService } from './mock/MockActivityService';
import { MockResultService } from './mock/MockResultService';
import { MockSession } from './mock/MockSession';
import { MockSubmissionService } from './mock/MockSubmissionService';
import type { GuidedNotesService } from './interfaces';
import type { ServiceRegistry } from './ServiceRegistry';

type ServiceKey = 'auth' | 'guidedNotes' | 'activity' | 'submission' | 'result';

/** Creates one registry per tab; every mock service in it shares one MockSession. */
export function createServiceRegistry(): ServiceRegistry {
  const session = new MockSession();
  const activity = new MockActivityService(session);
  const submission = new MockSubmissionService(session);
  const credentials = new TeacherCredentialStore();
  const api = new ApiClient(credentials);
  // 002 and 003: auth and guidedNotes are real; their mocks stay for tests only.
  const mockBound = new Set<ServiceKey>(['activity', 'submission', 'result']);
  const httpGuidedNotes = new HttpGuidedNotesService(api, new GooglePickerLauncher(api));
  // ponytail: the activity and result mocks build on session.lastImport; hand them the real import
  // so the teacher sees the imported questions. Drop this wrapper once 004–006 replace those mocks.
  const guidedNotes: GuidedNotesService = {
    pickSpreadsheet: () => httpGuidedNotes.pickSpreadsheet(),
    async readWorksheet(spreadsheetId, worksheet) {
      const result = await httpGuidedNotes.readWorksheet(spreadsheetId, worksheet);
      if (isImportSuccess(result)) session.lastImport = result;
      return result;
    },
  };

  return {
    auth: new HttpAuthService(new GisGoogleIdentityClient(), api, credentials),
    guidedNotes,
    activity,
    submission,
    result: new MockResultService(session),
    phaseControl: activity,
    judgementControl: submission,
    teammateControl: submission,
    activityValidationControl: activity,
    submissionValidationControl: submission,
    unexpectedErrorControl: session,
    isMockMode: () => mockBound.size > 0,
  };
}
