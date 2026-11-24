// Keeps the teacher credential in this tab only (002 research RD-10): sessionStorage is per tab,
// so a student tab in the same browser never sees it. Storage failures count as "no credential".
const KEY = 'teacherToken';

export class TeacherCredentialStore {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  set(token: string): void {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      // Storage disabled: the tab simply stays signed out.
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing stored, nothing to clear.
    }
  }
}
