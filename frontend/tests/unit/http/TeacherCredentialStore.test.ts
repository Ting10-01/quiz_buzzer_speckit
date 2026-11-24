import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherCredentialStore } from '../../../src/services/http/TeacherCredentialStore';

describe('TeacherCredentialStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('returns the stored token and null after clear', () => {
    const store = new TeacherCredentialStore();
    expect(store.get()).toBeNull();
    store.set('token-a');
    expect(store.get()).toBe('token-a');
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('writes only sessionStorage teacherToken, never localStorage or cookies', () => {
    new TeacherCredentialStore().set('token-a');
    expect(sessionStorage.getItem('teacherToken')).toBe('token-a');
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('treats an unusable sessionStorage as no credential', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = new TeacherCredentialStore();
    expect(() => store.set('token-a')).not.toThrow();
    expect(store.get()).toBeNull();
  });
});
