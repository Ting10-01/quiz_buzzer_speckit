// 001's ResultService over 006's server (contracts/results-api.md, research RD-10): result:* through
// 004's RealtimeClient, the write-back through 002's ApiClient.
import type { QuestionResult, WriteBackResult } from '@quiz-buzzer/shared/entities';
import { ApiError, type ApiClient } from './http/ApiClient';
import type { ResultService } from './interfaces';
import type { RealtimeClient } from './RealtimeClient';

// 006 spec「寫回失敗原因」: what the teacher sees when the server refuses the teacher credential.
const SIGN_IN_AGAIN = '老師登入已失效，請回首頁重新登入。沒有寫入任何格子。';

/** The ack of result:*: `{ ok: true, ...value }` or 002's ErrorBody with `ok: false`. */
type ResultAck<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };

export class ServerResultService implements ResultService {
  constructor(
    private readonly realtime: Pick<RealtimeClient, 'emitWithAck'>,
    private readonly api: Pick<ApiClient, 'request'>,
  ) {}

  async getQuestionResult(questionNumber: number): Promise<QuestionResult> {
    return (await this.ask<{ result: QuestionResult }>('result:question', { questionNumber })).result;
  }

  /** Every ended question, in question order. */
  async getAllResults(): Promise<QuestionResult[]> {
    return (await this.ask<{ results: QuestionResult[] }>('result:all', {})).results;
  }

  /**
   * 200 answers ok: true or the expected failure as it is. The two 401s are failures the teacher can
   * fix, so they are shown the same way; anything else (NETWORK, 500) rejects as it is.
   */
  async writeBack(): Promise<WriteBackResult> {
    try {
      return await this.api.request<WriteBackResult>('POST', '/api/results/write-back');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      if (error.code === 'GOOGLE_AUTH_EXPIRED') return { ok: false, cellCount: 0, failureReason: error.message };
      if (error.code === 'UNAUTHORIZED') return { ok: false, cellCount: 0, failureReason: SIGN_IN_AGAIN };
      throw error;
    }
  }

  /** emitWithAck already rejects with an UnexpectedError after 5 s; ok: false rejects with its message. */
  private async ask<T>(event: string, payload: object): Promise<T> {
    const ack = await this.realtime.emitWithAck<ResultAck<T>>(event, payload);
    if (!ack.ok) throw new Error(ack.message);
    return ack;
  }
}
