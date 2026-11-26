import { describe, expect, it, vi } from 'vitest';
import { ActivityStore } from '../../../src/activity/ActivityStore.js';
import { activityState } from '../../helpers/activityState.js';

// data-model "ActivityStore"; REQ-ACT-14 (versions), REQ-ACT-22 (cancel = commit(null)).
describe('ActivityStore', () => {
  it('starts with no activity at version 0', () => {
    const store = new ActivityStore();
    expect(store.current()).toBeNull();
    expect(store.version()).toBe(0);
  });

  it('adds 1 to the version on every commit and returns the new version', () => {
    const store = new ActivityStore();
    const state = activityState();
    expect(store.commit(state)).toBe(1);
    expect(store.current()).toBe(state);
    const opened = activityState({ phase: 'OPEN', currentQuestion: 1 });
    expect(store.commit(opened)).toBe(2);
    expect(store.current()).toBe(opened);
    expect(store.version()).toBe(2);
  });

  it('adds 1 even when the same state is committed again (only member counts changed)', () => {
    const store = new ActivityStore();
    const state = activityState();
    store.commit(state);
    expect(store.commit(state)).toBe(2);
    expect(store.version()).toBe(2);
    expect(store.current()).toBe(state);
  });

  it('commit(null) cancels the activity and still adds 1 to the version (REQ-ACT-22)', () => {
    const store = new ActivityStore();
    store.commit(activityState());
    expect(store.commit(null)).toBe(2);
    expect(store.current()).toBeNull();
    expect(store.version()).toBe(2);
  });

  it('calls listeners synchronously during commit with the new version', () => {
    const store = new ActivityStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.commit(activityState());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(1);
    store.commit(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(2);
  });

  it('lets a listener read the committed state while it is called', () => {
    const store = new ActivityStore();
    const state = activityState();
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.current()));
    store.commit(state);
    expect(seen).toEqual([state]);
  });

  it('stops calling a listener after it unsubscribes', () => {
    const store = new ActivityStore();
    const kept = vi.fn();
    const removed = vi.fn();
    store.subscribe(kept);
    const unsubscribe = store.subscribe(removed);
    store.commit(activityState());
    unsubscribe();
    store.commit(activityState());
    expect(removed).toHaveBeenCalledTimes(1);
    expect(kept).toHaveBeenCalledTimes(2);
  });
});
