import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AppConfig } from '../config.js';
import { sendError } from '../http/errors.js';
import { isGoogleAuthExpired, type GoogleClientProvider } from './GoogleClientProvider.js';
import { GoogleUnavailableError, isGoogleUnreachable, isInvalidGrant } from './GoogleOAuthGateway.js';
import type { TeacherAuth } from './TeacherAuth.js';

export interface AuthRoutesOptions {
  config: AppConfig;
  teacherAuth: TeacherAuth;
  googleClients: GoogleClientProvider;
}

const MAX_CODE_LENGTH = 2048;

function sendNotConfigured(reply: FastifyReply): FastifyReply {
  return sendError(reply, 503, 'GOOGLE_NOT_CONFIGURED', '伺服器尚未設定 Google 登入，請參考 README 設定環境變數');
}

// /api/auth/* (contracts/auth-http.md).
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, { config, teacherAuth, googleClients }) => {
  // `config.google` is read per request; null means the Google variables are missing (AC-21).
  app.get('/api/auth/config', async (_request, reply) => {
    if (!config.google) return sendNotConfigured(reply);
    return { clientId: config.google.clientId };
  });

  app.post('/api/auth/google', async (request, reply) => {
    if (!config.google) return sendNotConfigured(reply);
    const code = (request.body as { code?: unknown } | null)?.code;
    if (
      !request.headers['x-requested-with'] ||
      typeof code !== 'string' ||
      code.length === 0 ||
      code.length > MAX_CODE_LENGTH
    ) {
      return sendError(reply, 400, 'BAD_REQUEST', '登入請求格式錯誤');
    }

    try {
      const outcome = await teacherAuth.signIn(code);
      return outcome.ok
        ? { ok: true, teacherToken: outcome.teacherToken, account: outcome.account }
        : { ok: false, failure: outcome.failure };
    } catch (error) {
      if (isInvalidGrant(error)) return sendError(reply, 400, 'INVALID_CODE', 'Google 登入未完成，請再試一次');
      if (error instanceof GoogleUnavailableError) {
        return sendError(reply, 502, 'GOOGLE_UNAVAILABLE', '連不上 Google，請稍後再試');
      }
      throw error;
    }
  });

  app.get('/api/auth/me', { preHandler: app.requireTeacher }, async () => teacherAuth.currentAccount());

  // Data for the Google Picker in the teacher's browser (003). Never the refresh token or secret.
  app.get('/api/auth/picker-token', { preHandler: app.requireTeacher }, async (_request, reply) => {
    const google = config.google;
    if (!google) return sendNotConfigured(reply);
    const client = googleClients.authorizedClient();
    try {
      const { token } = await client.getAccessToken();
      if (!token) throw new GoogleUnavailableError('Google returned no access token');
      return { accessToken: token, apiKey: google.apiKey, appId: google.appId };
    } catch (error) {
      if (isGoogleAuthExpired(error)) {
        return sendError(reply, 401, 'GOOGLE_AUTH_EXPIRED', 'Google 授權已失效，請回首頁重新登入');
      }
      if (isGoogleUnreachable(error)) return sendError(reply, 502, 'GOOGLE_UNAVAILABLE', '連不上 Google，請稍後再試');
      throw error;
    }
  });
};
