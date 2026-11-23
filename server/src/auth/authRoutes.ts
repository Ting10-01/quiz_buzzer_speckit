import type { FastifyPluginAsync } from 'fastify';
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

// /api/auth/* (contracts/auth-http.md).
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, { config, teacherAuth, googleClients }) => {
  app.get('/api/auth/config', async () => ({ clientId: config.google!.clientId }));

  app.post('/api/auth/google', async (request, reply) => {
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
      throw error;
    }
  });

  app.get('/api/auth/me', { preHandler: app.requireTeacher }, async () => teacherAuth.currentAccount());

  // Data for the Google Picker in the teacher's browser (003). Never the refresh token or secret.
  app.get('/api/auth/picker-token', { preHandler: app.requireTeacher }, async (_request, reply) => {
    const client = googleClients.authorizedClient();
    try {
      const { token } = await client.getAccessToken();
      if (!token) throw new GoogleUnavailableError('Google returned no access token');
      return { accessToken: token, apiKey: config.google!.apiKey, appId: config.google!.appId };
    } catch (error) {
      if (isGoogleAuthExpired(error)) {
        return sendError(reply, 401, 'GOOGLE_AUTH_EXPIRED', 'Google 授權已失效，請回首頁重新登入');
      }
      if (isGoogleUnreachable(error)) return sendError(reply, 502, 'GOOGLE_UNAVAILABLE', '連不上 Google，請稍後再試');
      throw error;
    }
  });
};
