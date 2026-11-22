// Composition root: the only place that binds interfaces to implementations and the only
// file allowed to import services/mock (principle III, enforced by ESLint).
// Later sub-features replace a mock by changing its binding here (plan "替換模擬實作的方式").
import { MockActivityService } from './mock/MockActivityService';
import { MockAuthService } from './mock/MockAuthService';
import { MockGuidedNotesService } from './mock/MockGuidedNotesService';
import { MockResultService } from './mock/MockResultService';
import { MockSession } from './mock/MockSession';
import { MockSubmissionService } from './mock/MockSubmissionService';
import type { ServiceRegistry } from './ServiceRegistry';

type ServiceKey = 'auth' | 'guidedNotes' | 'activity' | 'submission' | 'result';

/** Creates one registry per tab; every mock service in it shares one MockSession. */
export function createServiceRegistry(): ServiceRegistry {
  const session = new MockSession();
  const activity = new MockActivityService(session);
  const submission = new MockSubmissionService(session);
  const mockBound = new Set<ServiceKey>(['auth', 'guidedNotes', 'activity', 'submission', 'result']);

  return {
    auth: new MockAuthService(session),
    guidedNotes: new MockGuidedNotesService(session),
    activity,
    submission,
    result: new MockResultService(session),
    phaseControl: activity,
    judgementControl: submission,
    teammateControl: submission,
    activityValidationControl: activity,
    submissionValidationControl: submission,
    unexpectedErrorControl: session,
    choicePrompt: session,
    isMockMode: () => mockBound.size > 0,
  };
}
