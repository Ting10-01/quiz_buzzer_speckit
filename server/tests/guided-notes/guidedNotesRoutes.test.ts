import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInFor } from '../helpers/fakeGoogleGateway.js';
import { createTestApp, type TestApp } from '../helpers/testApp.js';
import { FakeSpreadsheetReader } from './helpers/fakeSpreadsheetReader.js';
import { loadFixture } from './helpers/gridBuilder.js';

const ID = 'spreadsheet-id-0001';
const BAD_REQUEST = { code: 'BAD_REQUEST', message: '讀取學習單的請求格式錯誤' };

let t: TestApp;
let reader: FakeSpreadsheetReader;
let token: string;

async function signIn(code: string): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/google',
    headers: { 'x-requested-with': 'XmlHttpRequest' },
    payload: { code },
  });
  return res.json().teacherToken;
}

function describeRequest(spreadsheetId: string) {
  return t.app.inject({
    method: 'GET',
    url: `/api/guided-notes/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function readRequest(payload: unknown) {
  return t.app.inject({
    method: 'POST',
    url: '/api/guided-notes/read',
    headers: { authorization: `Bearer ${token}` },
    payload: payload as Record<string, unknown>,
  });
}

beforeEach(async () => {
  reader = new FakeSpreadsheetReader().set(ID, loadFixture('multi-sheet'));
  t = await createTestApp({ spreadsheetReader: reader });
  t.gateway.set('code-a', signInFor('teacher.a@example.com'));
  token = await signIn('code-a');
});

afterEach(async () => {
  await t.app.close();
});

describe('GET /api/guided-notes/spreadsheets/:spreadsheetId', () => {
  it('answers 200 with the Spreadsheet', async () => {
    const res = await describeRequest(ID);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ID,
      title: '計算機概論基礎 學習單',
      editable: true,
      worksheets: ['說明', '學習單'],
      selectedWorksheet: '學習單',
    });
    expect(t.app.importStore.latest()).toBeNull();
  });

  it.each([
    ['9 characters', 'a'.repeat(9)],
    ['201 characters', 'a'.repeat(201)],
    ['a character outside [A-Za-z0-9_-]', 'spreadsheet.id0001'],
  ])('rejects an id of %s with 400 BAD_REQUEST', async (_name, spreadsheetId) => {
    const res = await describeRequest(spreadsheetId);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(BAD_REQUEST);
    expect(reader.loadCalls).toEqual([]);
  });

  it('accepts ids of 10 and 200 characters', async () => {
    for (const id of ['a'.repeat(10), 'A_-z'.repeat(50)]) {
      reader.set(id, loadFixture('single'));
      expect((await describeRequest(id)).statusCode).toBe(200);
    }
  });
});

describe('POST /api/guided-notes/read', () => {
  it('answers 200 with the ImportSuccess and stores it', async () => {
    const res = await readRequest({ spreadsheetId: ID, worksheet: '學習單' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spreadsheet.selectedWorksheet).toBe('學習單');
    expect(body.headerRow).toBe(4);
    expect(body.headerColumns).toEqual(['B', 'C', 'G']);
    expect(body.questions).toHaveLength(6);
    expect(t.app.importStore.latest()).toEqual(body);
  });

  it('accepts a worksheet name of 100 characters', async () => {
    const res = await readRequest({ spreadsheetId: ID, worksheet: '表'.repeat(100) });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['a bad spreadsheetId', { spreadsheetId: 'short', worksheet: '學習單' }],
    ['an empty worksheet', { spreadsheetId: ID, worksheet: '' }],
    ['a worksheet over 100 characters', { spreadsheetId: ID, worksheet: '表'.repeat(101) }],
    ['a missing worksheet', { spreadsheetId: ID }],
    ['a missing spreadsheetId', { worksheet: '學習單' }],
    ['an extra field', { spreadsheetId: ID, worksheet: '學習單', range: 'A1:H20' }],
    ['a non-object body', ['學習單']],
  ])('rejects %s with 400 BAD_REQUEST', async (_name, payload) => {
    const res = await readRequest(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(BAD_REQUEST);
    expect(reader.loadCalls).toEqual([]);
    expect(t.app.importStore.latest()).toBeNull();
  });
});
