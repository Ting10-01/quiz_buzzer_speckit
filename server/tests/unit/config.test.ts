import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const fullEnv = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_API_KEY: 'api-key',
  GOOGLE_APP_ID: '123456789012',
};

describe('loadConfig', () => {
  it('builds GoogleConfig when all four Google variables are set', () => {
    const config = loadConfig(fullEnv);
    expect(config.google).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: 'api-key',
      appId: '123456789012',
    });
    expect(config.missingGoogleVars).toEqual([]);
  });

  it('sets google to null and lists missing or blank variables', () => {
    const config = loadConfig({ ...fullEnv, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_APP_ID: '   ' });
    expect(config.google).toBeNull();
    expect(config.missingGoogleVars).toEqual(['GOOGLE_CLIENT_SECRET', 'GOOGLE_APP_ID']);
  });

  it('lists all four variables when none is set', () => {
    expect(loadConfig({}).missingGoogleVars).toEqual([
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_API_KEY',
      'GOOGLE_APP_ID',
    ]);
  });

  it('defaults PORT to 3000', () => {
    expect(loadConfig(fullEnv).port).toBe(3000);
  });

  it('accepts a valid PORT', () => {
    expect(loadConfig({ ...fullEnv, PORT: '65535' }).port).toBe(65535);
  });

  it.each(['0', '65536', '3000.5', 'abc', '-1'])('rejects PORT=%j naming the variable', (port) => {
    expect(() => loadConfig({ ...fullEnv, PORT: port })).toThrow(/PORT/);
  });
});
