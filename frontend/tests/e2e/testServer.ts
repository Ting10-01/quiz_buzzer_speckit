// Starts the real server with a fake Google gateway (server/tests/e2e/startTestServer.ts) for
// teacher-login.spec.ts. Own port 3100, so a running dev server with real Google settings is never
// used by tests. Started here instead of in playwright.config.ts so only the specs that need it pay.
import { spawn } from 'node:child_process';

export const TEST_SERVER = 'http://127.0.0.1:3100';

/** Resolves once the server answers; the returned function stops it. */
export async function startTestServer(): Promise<() => void> {
  // node --import tsx runs the TypeScript entry in one process, so kill() stops the whole server.
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/e2e/startTestServer.ts'], {
    cwd: '../server',
    env: { ...process.env, PORT: '3100' },
    stdio: 'ignore',
  });
  const stop = () => {
    child.kill();
  };
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${TEST_SERVER}/api/auth/config`)).ok) return stop;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  stop();
  throw new Error('the fake-Google test server did not start within 20 seconds');
}
