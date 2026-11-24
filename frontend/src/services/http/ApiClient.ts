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

function isErrorBody(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

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

    // Every error from our server carries an ErrorBody. Without one the answer came from something in
    // between, e.g. the Vite dev proxy's empty 502 when the server is not running (AC-23).
    if (!isErrorBody(data)) throw new ApiError(response.status, 'NETWORK', SERVER_UNREACHABLE);
    const { code, message } = data;
    if (response.status === 401 && code === 'UNAUTHORIZED' && token) {
      // Another sign-in replaced this tab's credential (REQ-AUTH-11).
      this.credentials.clear();
      throw new ApiError(401, code, SIGN_IN_AGAIN);
    }
    throw new ApiError(response.status, code, message);
  }
}
