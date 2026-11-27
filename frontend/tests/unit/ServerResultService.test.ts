import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/services/http/ApiClient';
import { ServerResultService } from '../../src/services/ServerResultService';
import { FakeRealtimeClient } from '../helpers/fakeRealtimeClient';
import { makeQuestionResult } from '../helpers/fixtures';

// 006 T007: ResultService over 004's RealtimeClient and 002's ApiClient (contracts/results-api.md).
const SERVER_UNREACHABLE = '連不上伺服器，請確認伺服器已啟動';

const RESULT = makeQuestionResult({ questionNumber: 2 });

let realtime: FakeRealtimeClient;
let api: { request: ReturnType<typeof vi.fn> };
let service: ServerResultService;

beforeEach(() => {
  realtime = new FakeRealtimeClient();
  api = { request: vi.fn() };
  service = new ServerResultService(realtime as never, api as never);
});

describe('ServerResultService.getQuestionResult', () => {
  it('emits result:question with the question number and resolves with the result', async () => {
    realtime.emitWithAck.mockResolvedValue({ ok: true, result: RESULT });
    await expect(service.getQuestionResult(2)).resolves.toEqual(RESULT);
    expect(realtime.emitWithAck).toHaveBeenCalledWith('result:question', { questionNumber: 2 });
  });

  it('rejects with the message of an ok: false ack', async () => {
    realtime.emitWithAck.mockResolvedValue({ ok: false, code: 'QUESTION_NOT_ENDED', message: '這一題還沒結束，結果尚未公布' });
    await expect(service.getQuestionResult(3)).rejects.toMatchObject({ message: '這一題還沒結束，結果尚未公布' });
  });

  it('passes an emitWithAck rejection through as it is', async () => {
    const timeout = new Error(SERVER_UNREACHABLE);
    realtime.emitWithAck.mockRejectedValue(timeout);
    await expect(service.getQuestionResult(2)).rejects.toBe(timeout);
  });
});

// T013
describe('ServerResultService.getAllResults', () => {
  it('emits result:all and resolves with the results', async () => {
    const results = [makeQuestionResult({ questionNumber: 1 }), RESULT];
    realtime.emitWithAck.mockResolvedValue({ ok: true, results });
    await expect(service.getAllResults()).resolves.toEqual(results);
    expect(realtime.emitWithAck).toHaveBeenCalledWith('result:all', {});
  });

  it('rejects with the message of an ok: false ack', async () => {
    realtime.emitWithAck.mockResolvedValue({ ok: false, code: 'NO_ACTIVITY', message: '目前沒有活動' });
    await expect(service.getAllResults()).rejects.toMatchObject({ message: '目前沒有活動' });
  });

  it('passes the emitWithAck timeout through as it is', async () => {
    const timeout = new Error(SERVER_UNREACHABLE);
    realtime.emitWithAck.mockRejectedValue(timeout);
    await expect(service.getAllResults()).rejects.toBe(timeout);
  });
});

// T020
describe('ServerResultService.writeBack', () => {
  it('posts to /api/results/write-back and resolves with the body as it is', async () => {
    const body = { ok: true, cellCount: 6 };
    api.request.mockResolvedValue(body);
    await expect(service.writeBack()).resolves.toEqual(body);
    expect(api.request).toHaveBeenCalledWith('POST', '/api/results/write-back');
  });
});

// T028: a failed write-back is shown as a WriteBackResult; anything else rejects (contracts/results-api.md).
describe('ServerResultService.writeBack failures', () => {
  const AUTH_EXPIRED = 'Google 授權已失效，請回首頁重新登入後再寫回。沒有寫入任何格子。';

  it('resolves with a 200 ok: false body as it is', async () => {
    const body = { ok: false, cellCount: 0, failureReason: '沒有編輯權限，無法寫回。請改用可以編輯這份試算表的帳號。沒有寫入任何格子。' };
    api.request.mockResolvedValue(body);
    await expect(service.writeBack()).resolves.toEqual(body);
  });

  it('turns 401 GOOGLE_AUTH_EXPIRED into a failure with its message', async () => {
    api.request.mockRejectedValue(new ApiError(401, 'GOOGLE_AUTH_EXPIRED', AUTH_EXPIRED));
    await expect(service.writeBack()).resolves.toEqual({ ok: false, cellCount: 0, failureReason: AUTH_EXPIRED });
  });

  it('turns 401 UNAUTHORIZED into a failure saying nothing was written', async () => {
    api.request.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '老師登入已失效，請回首頁重新登入'));
    await expect(service.writeBack()).resolves.toEqual({
      ok: false,
      cellCount: 0,
      failureReason: '老師登入已失效，請回首頁重新登入。沒有寫入任何格子。',
    });
  });

  it.each([
    ['NETWORK', new ApiError(0, 'NETWORK', SERVER_UNREACHABLE)],
    ['500', new ApiError(500, 'INTERNAL', '伺服器發生錯誤')],
  ])('rejects a %s ApiError as it is', async (_label, error) => {
    api.request.mockRejectedValue(error);
    await expect(service.writeBack()).rejects.toBe(error);
  });
});
