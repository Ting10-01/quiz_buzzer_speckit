import { describe, expect, it, vi } from 'vitest';
import { MockSession } from '../../src/services/mock/MockSession';

const request = { title: 'Pick', options: [{ id: 'a', label: 'A' }] };

describe('MockSession', () => {
  it('notifies the request and resolves with the answered id', async () => {
    const session = new MockSession();
    const listener = vi.fn();
    session.onRequest(listener);
    const result = session.requestChoice(request);
    expect(listener).toHaveBeenCalledWith(request);
    session.answer('a');
    await expect(result).resolves.toBe('a');
  });

  it('resolves with null when the chooser is closed', async () => {
    const session = new MockSession();
    const result = session.requestChoice(request);
    session.answer(null);
    await expect(result).resolves.toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const session = new MockSession();
    const listener = vi.fn();
    const unsubscribe = session.onRequest(listener);
    unsubscribe();
    void session.requestChoice(request);
    expect(listener).not.toHaveBeenCalled();
  });

  it('consumes an armed unexpected error exactly once (edge)', () => {
    const session = new MockSession();
    expect(session.consumeUnexpectedError()).toBe(false);
    session.failNextCall();
    expect(session.consumeUnexpectedError()).toBe(true);
    expect(session.consumeUnexpectedError()).toBe(false);
  });
});
