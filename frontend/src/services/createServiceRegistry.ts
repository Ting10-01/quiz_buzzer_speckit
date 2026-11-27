// Composition root: the only place that binds interfaces to implementations and the only
// file allowed to import services/mock (principle III, enforced by ESLint).
// Later sub-features replace a mock by changing its binding here (plan "替換模擬實作的方式").
import { GooglePickerLauncher } from './google/GooglePickerLauncher';
import { ApiClient } from './http/ApiClient';
import { GisGoogleIdentityClient } from './http/GisGoogleIdentityClient';
import { HttpAuthService } from './http/HttpAuthService';
import { HttpGuidedNotesService } from './http/HttpGuidedNotesService';
import { TeacherCredentialStore } from './http/TeacherCredentialStore';
import { HttpActivityService } from './HttpActivityService';
import { RealtimeClient } from './RealtimeClient';
import { ServerResultService } from './ServerResultService';
import { ServerSubmissionService } from './server/ServerSubmissionService';
import type { ServiceRegistry } from './ServiceRegistry';

/** Creates one registry per tab. 002–006 bind every interface for real; the mocks stay for tests only. */
export function createServiceRegistry(): ServiceRegistry {
  const credentials = new TeacherCredentialStore();
  const api = new ApiClient(credentials);
  // One WebSocket connection per tab; the server sends the current activity on connect (004).
  const realtime = new RealtimeClient(credentials);
  const activity = new HttpActivityService(realtime, api);
  realtime.connect();

  return {
    auth: new HttpAuthService(new GisGoogleIdentityClient(), api, credentials),
    guidedNotes: new HttpGuidedNotesService(api, new GooglePickerLauncher(api)),
    activity,
    submission: new ServerSubmissionService(realtime, api),
    result: new ServerResultService(realtime, api),
    isMockMode: () => false,
  };
}
