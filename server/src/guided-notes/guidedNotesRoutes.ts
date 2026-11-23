import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../http/errors.js';
import { GuidedNotesImporter } from './GuidedNotesImporter.js';

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

// /api/guided-notes/* (contracts/guided-notes-http.md). Teacher only.
export const guidedNotesRoutes: FastifyPluginAsync = async (app) => {
  const importer = new GuidedNotesImporter(app.spreadsheetReader, app.importStore);

  app.get<{ Params: { spreadsheetId: string } }>(
    '/api/guided-notes/spreadsheets/:spreadsheetId',
    { preHandler: app.requireTeacher, schema: describeSchema, attachValidation: true },
    async (request, reply) => sendBadRequest(request, reply) ?? importer.describe(request.params.spreadsheetId),
  );

  app.post<{ Body: { spreadsheetId: string; worksheet: string } }>(
    '/api/guided-notes/read',
    { preHandler: app.requireTeacher, schema: readSchema, attachValidation: true },
    async (request, reply) =>
      sendBadRequest(request, reply) ?? importer.read(request.body.spreadsheetId, request.body.worksheet),
  );
};
