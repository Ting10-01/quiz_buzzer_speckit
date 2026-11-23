// The only place in the server that reads environment variables (contracts/server-extension.md).

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  appId: string;
}

export interface AppConfig {
  port: number;
  google: GoogleConfig | null;
  missingGoogleVars: string[];
}

const GOOGLE_VARS = {
  clientId: 'GOOGLE_CLIENT_ID',
  clientSecret: 'GOOGLE_CLIENT_SECRET',
  apiKey: 'GOOGLE_API_KEY',
  appId: 'GOOGLE_APP_ID',
} as const;

const DEFAULT_PORT = 3000;

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const google: Partial<GoogleConfig> = {};
  const missingGoogleVars: string[] = [];
  for (const [field, name] of Object.entries(GOOGLE_VARS) as [keyof GoogleConfig, string][]) {
    const value = env[name]?.trim();
    if (value) google[field] = value;
    else missingGoogleVars.push(name);
  }

  return {
    port: parsePort(env.PORT),
    google: missingGoogleVars.length === 0 ? (google as GoogleConfig) : null,
    missingGoogleVars,
  };
}

function parsePort(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return DEFAULT_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${value}"`);
  }
  return port;
}
