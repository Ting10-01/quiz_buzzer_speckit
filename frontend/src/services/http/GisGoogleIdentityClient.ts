// GoogleIdentityClient backed by Google Identity Services (GIS) code flow in a popup
// (002 research RD-10). The script is loaded on first use, not with the page.
import { GoogleCodeError, type GoogleCodeResult, type GoogleIdentityClient } from './GoogleIdentityClient';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface CodeResponse {
  code?: string;
  error?: string;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: 'popup';
  prompt: string;
  callback(response: CodeResponse): void;
  error_callback(error: { type: string }): void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initCodeClient(config: CodeClientConfig): { requestCode(): void } } } };
  }
}

export class GisGoogleIdentityClient implements GoogleIdentityClient {
  private loading: Promise<void> | null = null;

  async requestCode(clientId: string, scopes: string[]): Promise<GoogleCodeResult> {
    try {
      await this.load();
    } catch {
      return { error: GoogleCodeError.LOAD_FAILED };
    }
    return new Promise((resolve) => {
      window
        .google!.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: scopes.join(' '),
          ux_mode: 'popup',
          // Ask every time so Google returns a refresh token and the teacher can switch accounts.
          prompt: 'consent select_account',
          // access_denied and any other refusal mean the teacher did not finish signing in.
          callback: (response) =>
            resolve(response.code ? { code: response.code } : { error: GoogleCodeError.CANCELLED }),
          error_callback: (error) =>
            resolve({
              error:
                error.type === 'popup_failed_to_open' ? GoogleCodeError.POPUP_BLOCKED : GoogleCodeError.CANCELLED,
            }),
        })
        .requestCode();
    });
  }

  private load(): Promise<void> {
    if (window.google?.accounts) return Promise.resolve();
    this.loading ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        this.loading = null; // allow a retry after the network comes back
        reject(new Error('GIS load failed'));
      };
      document.head.append(script);
    });
    return this.loading;
  }
}
