// Test double for ServiceRegistry: every service method is a vi.fn(); subscriptions return a
// vi.fn() unsubscribe. Override individual methods, mock controls and isMockMode as needed.
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type {
  ActivityService,
  AuthService,
  GuidedNotesService,
  ResultService,
  SubmissionService,
} from '../../src/services/interfaces';
import type { ServiceRegistry } from '../../src/services/ServiceRegistry';
import { ServiceRegistryProvider } from '../../src/services/ServiceRegistryContext';

type Controls = Pick<
  ServiceRegistry,
  | 'phaseControl'
  | 'judgementControl'
  | 'activityValidationControl'
  | 'submissionValidationControl'
  | 'unexpectedErrorControl'
  | 'choicePrompt'
>;

export interface FakeRegistryOverrides extends Partial<Controls> {
  auth?: Partial<AuthService>;
  guidedNotes?: Partial<GuidedNotesService>;
  activity?: Partial<ActivityService>;
  submission?: Partial<SubmissionService>;
  result?: Partial<ResultService>;
  isMockMode?: boolean;
}

const subscription = () => vi.fn(() => vi.fn());

export function createFakeRegistry(overrides: FakeRegistryOverrides = {}): ServiceRegistry {
  const { auth, guidedNotes, activity, submission, result, isMockMode = false, ...controls } =
    overrides;
  return {
    auth: { signInWithGoogle: vi.fn(), getCurrentAccount: vi.fn(), ...auth },
    guidedNotes: { pickSpreadsheet: vi.fn(), readWorksheet: vi.fn(), ...guidedNotes },
    activity: {
      createActivity: vi.fn(),
      updateSettings: vi.fn(),
      openQuestion: vi.fn(),
      endQuestion: vi.fn(),
      joinGroup: vi.fn(),
      leaveGroup: vi.fn(),
      getCurrentActivity: vi.fn(),
      onPhaseChange: subscription(),
      onActivityChange: subscription(),
      ...activity,
    },
    submission: {
      submitAnswer: vi.fn(),
      listSubmissions: vi.fn(),
      onSubmissionsChange: subscription(),
      judge: vi.fn(),
      onJudgement: subscription(),
      ...submission,
    },
    result: { getQuestionResult: vi.fn(), getAllResults: vi.fn(), writeBack: vi.fn(), ...result },
    ...controls,
    isMockMode: () => isMockMode,
  };
}

export function renderWithRegistry(ui: ReactElement, registry: ServiceRegistry): RenderResult {
  return render(<ServiceRegistryProvider registry={registry}>{ui}</ServiceRegistryProvider>);
}
