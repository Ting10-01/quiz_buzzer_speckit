import { describe, expect, it } from 'vitest';
import { createServiceRegistry } from '../../src/services/createServiceRegistry';

describe('createServiceRegistry', () => {
  it('binds every interface to a mock and exposes every mock control', () => {
    const registry = createServiceRegistry();
    expect(registry.isMockMode()).toBe(true);
    expect(registry.phaseControl).toBeDefined();
    expect(registry.judgementControl).toBeDefined();
    expect(registry.activityValidationControl).toBeDefined();
    expect(registry.submissionValidationControl).toBeDefined();
    expect(registry.unexpectedErrorControl).toBeDefined();
    expect(registry.choicePrompt).toBeDefined();
    expect(registry.unexpectedErrorControl).toBe(registry.choicePrompt);
  });

  it('shares one MockSession inside a registry', async () => {
    const registry = createServiceRegistry();
    await registry.phaseControl!.advancePhase();
    await registry.activity.joinGroup(2);
    const sent = await registry.submission.submitAnswer(1, ['a']);
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
