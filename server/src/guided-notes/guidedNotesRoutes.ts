import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { TeacherNotSignedInError } from '../auth/GoogleClientProvider.js';
import { sendError } from '../http/errors.js';
import { GuidedNotesImporter } from './GuidedNotesImporter.js';
import { SheetsReadError } from './SpreadsheetReader.js';

const SPREADSHEET_ID = { type: 'string', pattern: '^[A-Za-z0-9_-]{10,200}$' } as const;

const describeSchema = {
  params: {
    type: 'object',
    properties: { spreadsheetId: SPREADSHEET_ID },
    required: ['spreadsheetId'],
  },
};

// `propertyNames` rejects extra fields: Fastify's Ajv would silently remove them under
// `additionalProperties: false`.
const readSchema = {
  body: {
    type: 'object',
    properties: {
      spreadsheetId: SPREADSHEET_ID,
      worksheet: { type: 'string', minLength: 1, maxLength: 100 },
    },
    required: ['spreadsheetId', 'worksheet'],
    propertyNames: { enum: ['spreadsheetId', 'worksheet'] },
  },
};

// With `attachValidation`, requireTeacher still answers 401 before a malformed request gets 400.
function sendBadRequest(request: FastifyRequest, reply: FastifyReply): FastifyReply | null {
  return request.validationError ? sendError(reply, 400, 'BAD_REQUEST', '讀取學習單的請求格式錯誤') : null;
}

// Errors the importer throws, as ErrorBody responses (contracts/guided-notes-http.md).
// NO_ACCESS only reaches here from describe(); read() returns it as an ImportError.
function sendReadFailure(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof TeacherNotSignedInError) {
    return sendError(reply, 401, 'NOT_SIGNED_IN', '老師登入已失效，請回首頁重新登入');
  }
  if (!(error instanceof SheetsReadError)) throw error;
  switch (error.kind) {
    case 'NO_ACCESS':
      return sendError(reply, 403, 'NO_ACCESS', '無法讀取這份試算表，請用「重新挑選」再挑一次');
    case 'AUTH_EXPIRED':
      return sendError(reply, 401, 'GOOGLE_AUTH_EXPIRED', 'Google 授權已失效，請回首頁重新登入');
    case 'UNAVAILABLE':
      return sendError(reply, 502, 'GOOGLE_UNAVAILABLE', '連不上 Google，請稍後再試');
  }
}

// /api/guided-notes/* (contracts/guided-notes-http.md). Teacher only.
export const guidedNotesRoutes: FastifyPluginAsync = async (app) => {
  const importer = new GuidedNotesImporter(app.spreadsheetReader, app.importStore, app.log);

  app.get<{ Params: { spreadsheetId: string } }>(
    '/api/guided-notes/spreadsheets/:spreadsheetId',
    { preHandler: app.requireTeacher, schema: describeSchema, attachValidation: true },
    async (request, reply) =>
      sendBadRequest(request, reply) ??
      importer.describe(request.params.spreadsheetId).catch((error: unknown) => sendReadFailure(reply, error)),
  );

  app.post<{ Body: { spreadsheetId: string; worksheet: string } }>(
    '/api/guided-notes/read',
    { preHandler: app.requireTeacher, schema: readSchema, attachValidation: true },
    async (request, reply) =>
      sendBadRequest(request, reply) ??
      importer
        .read(request.body.spreadsheetId, request.body.worksheet)
        .catch((error: unknown) => sendReadFailure(reply, error)),
  );
};
