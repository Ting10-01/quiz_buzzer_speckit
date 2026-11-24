// Opens Google Picker so the teacher picks one Google spreadsheet (003 research R2). Under the
// drive.file scope only files picked this way are readable by the server.
import type { UnexpectedError } from '@quiz-buzzer/shared/entities';
import type { ApiClient } from '../http/ApiClient';

const PICKER_SRC = 'https://apis.google.com/js/api.js';
const LOAD_TIMEOUT_MS = 15_000;
const LOAD_FAILED: UnexpectedError = { message: '無法載入 Google 檔案選擇器，請確認網路連線' };

interface PickerToken {
  accessToken: string;
  apiKey: string;
  appId: string;
}

// Only the parts of the Picker API this file uses (no @types/google.picker).
interface PickerResult {
  action: string;
  docs?: { id: string }[];
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface PickerNamespace {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { SPREADSHEETS: string };
  DocsView: new (viewId: string) => { setMimeTypes(types: string): unknown };
  PickerBuilder: new () => PickerBuilder;
}
interface PickerWindow {
  gapi?: { load(name: string, options: { callback(): void; onerror(): void }): void };
  google?: { picker?: PickerNamespace };
}

export class GooglePickerLauncher {
  private loading: Promise<PickerNamespace> | null = null;

  constructor(private readonly api: Pick<ApiClient, 'request'>) {}

  /** The picked spreadsheet id, or null when the teacher closes the Picker. */
  async pick(): Promise<string | null> {
    const token = await this.api.request<PickerToken>('GET', '/api/auth/picker-token');
    const picker = await this.load();
    return new Promise((resolve) => {
      const view = new picker.DocsView(picker.ViewId.SPREADSHEETS);
      view.setMimeTypes('application/vnd.google-apps.spreadsheet');
      new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token.accessToken)
        .setDeveloperKey(token.apiKey)
        .setAppId(token.appId)
        .setCallback((result) => {
          if (result.action === picker.Action.PICKED) resolve(result.docs?.[0]?.id ?? null);
          else if (result.action === picker.Action.CANCEL) resolve(null);
        })
        .build()
        .setVisible(true);
    });
  }

  private load(): Promise<PickerNamespace> {
    const win = window as unknown as PickerWindow;
    if (win.google?.picker) return Promise.resolve(win.google.picker);
    this.loading ??= new Promise<PickerNamespace>((resolve, reject) => {
      const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
      const script = document.createElement('script');
      script.src = PICKER_SRC;
      script.async = true;
      script.onerror = fail;
      script.onload = () =>
        win.gapi!.load('picker', {
          callback: () => {
            clearTimeout(timer);
            resolve(win.google!.picker!);
          },
          onerror: fail,
        });
      document.head.append(script);

      function fail() {
        clearTimeout(timer);
        script.remove();
        reject(LOAD_FAILED);
      }
    }).catch((error: unknown) => {
      this.loading = null; // let the teacher retry once the network is back
      throw error;
    });
    return this.loading;
  }
}
