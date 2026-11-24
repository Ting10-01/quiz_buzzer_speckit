// The one way the frontend calls the server (002 research RD-10); 003–006 Http*Services share it.
import type { TeacherCredentialStore } from './TeacherCredentialStore';

/** Rejection value for every failed request; has `message`, so it is a 001 UnexpectedError. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const SIGN_IN_AGAIN = '老師登入已失效，請回首頁重新登入';
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';
const SERVER_ERROR = '伺服器發生錯誤，請稍後再試';

export class ApiClient {
  constructor(private readonly credentials: TeacherCredentialStore) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.credentials.get();
    // X-Requested-With guards POST /api/auth/google against cross-site form posts (research RD-09).
    const headers: Record<string, string> = { 'X-Requested-With': 'XmlHttpRequest' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', SERVER_UNREACHABLE);
    }

    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return data as T;

    const { code = 'INTERNAL', message = SERVER_ERROR } = (data ?? {}) as { code?: string; message?: string };
    if (response.status === 401 && code === 'UNAUTHORIZED' && token) {
      // Another sign-in replaced this tab's credential (REQ-AUTH-11).
      this.credentials.clear();
      throw new ApiError(401, code, SIGN_IN_AGAIN);
    }
    throw new ApiError(response.status, code, message);
  }
}
