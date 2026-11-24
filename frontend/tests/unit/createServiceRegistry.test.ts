import { describe, expect, it } from 'vitest';
import { createServiceRegistry } from '../../src/services/createServiceRegistry';
import { HttpAuthService } from '../../src/services/http/HttpAuthService';

describe('createServiceRegistry', () => {
  it('binds every interface to a mock and exposes every mock control', () => {
    const registry = createServiceRegistry();
    expect(registry.isMockMode()).toBe(true);
    expect(registry.phaseControl).toBeDefined();
    expect(registry.judgementControl).toBeDefined();
    expect(registry.teammateControl).toBeDefined();
    expect(registry.teammateControl).toBe(registry.submission);
    expect(registry.activityValidationControl).toBeDefined();
    expect(registry.submissionValidationControl).toBeDefined();
    expect(registry.unexpectedErrorControl).toBeDefined();
    expect(registry.choicePrompt).toBeDefined();
    expect(registry.unexpectedErrorControl).toBe(registry.choicePrompt);
  });

  it('binds auth to the real HttpAuthService (002) and keeps the other mocks', () => {
    const registry = createServiceRegistry();
    expect(registry.auth).toBeInstanceOf(HttpAuthService);
    expect(registry.isMockMode()).toBe(true);
    // guidedNotes is still a mock, so the mock chooser stays (001 plan "替換模擬實作的方式").
    expect(registry.choicePrompt).toBeDefined();
  });

  it('shares one MockSession inside a registry', async () => {
    const registry = createServiceRegistry();
    await registry.phaseControl!.advancePhase();
    await registry.activity.joinGroup(2);
    await registry.phaseControl!.advancePhase();
    const sent = await registry.submission.submitAnswer(1, ['a', 'b']);
    expect(sent).toMatchObject({ groupNumber: 2 });
    registry.unexpectedErrorControl!.failNextCall();
    await expect(registry.result.getAllResults()).rejects.toEqual({
      message: '模擬：連不上伺服器',
    });
  });

  it('keeps separate state per registry (one per tab)', async () => {
    const a = createServiceRegistry();
    const b = createServiceRegistry();
    await a.phaseControl!.advancePhase();
    await expect(a.activity.getCurrentActivity()).resolves.not.toBeNull();
    await expect(b.activity.getCurrentActivity()).resolves.toBeNull();
  });
});
