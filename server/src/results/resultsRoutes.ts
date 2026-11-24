import type { FastifyPluginAsync } from 'fastify';
import { sendError } from '../http/errors.js';
import type { WriteBackResult } from '@quiz-buzzer/shared/entities';
import { WriteBackFailure, type WriteBackService } from './WriteBackService.js';

export interface ResultsRoutesOptions {
  writeBack: Pick<WriteBackService, 'writeBack'>;
}

// POST /api/results/write-back (contracts/results-api.md). Teacher only. Expected failures are a
// WriteBackResult with ok: false; only GOOGLE_AUTH_EXPIRED is a 401 ErrorBody (research RD-09).
export const resultsRoutes: FastifyPluginAsync<ResultsRoutesOptions> = async (app, { writeBack }) => {
  app.post('/api/results/write-back', { preHandler: app.requireTeacher }, async (_request, reply) => {
    try {
      return await writeBack.writeBack();
    } catch (error) {
      if (!(error instanceof WriteBackFailure)) throw error;
      if (error.code === 'GOOGLE_AUTH_EXPIRED') return sendError(reply, 401, error.code, error.message);
      const result: WriteBackResult = { ok: false, cellCount: 0, failureReason: error.message };
      return result;
    }
  });
};
