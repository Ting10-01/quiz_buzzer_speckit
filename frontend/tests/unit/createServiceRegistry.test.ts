import { describe, expect, it, vi } from 'vitest';
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
    // auth (002) and guidedNotes (003) are real, so the mock chooser is gone (001 plan).
    expect(registry.choicePrompt).toBeUndefined();
  });

  it('binds auth to the real HttpAuthService (002) and keeps the other mocks', () => {
    const registry = createServiceRegistry();
    expect(registry.auth).toBeInstanceOf(HttpAuthService);
    expect(registry.isMockMode()).toBe(true);
  });

  it('hands a real import to the activity mock so it uses the imported questions (003)', async () => {
    const imported = {
      spreadsheet: { id: 'sheet-1', title: 'T', editable: true, worksheets: ['W'], selectedWorksheet: 'W' },
      headerRow: 1,
      headerColumns: ['A', 'B'],
      questions: [{ number: 7, type: 'SINGLE', text: '第七題', subQuestions: [{ index: 1, blankCell: 'B2' }] }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(imported), { status: 200 })));
    const registry = createServiceRegistry();
    await registry.guidedNotes.readWorksheet('sheet-1', 'W');
    const activity = await registry.activity.createActivity({ groupCount: 2 });
    expect(activity).toMatchObject({ questions: [{ number: 7 }] });
    vi.unstubAllGlobals();
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
