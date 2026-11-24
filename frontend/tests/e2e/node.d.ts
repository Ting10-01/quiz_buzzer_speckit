// Playwright runs e2e helpers in Node, but frontend has no Node types (like playwright.config.ts,
// declare only what is used).
declare module 'node:child_process' {
  export function spawn(
    command: string,
    args: string[],
    options: { cwd: string; env: Record<string, string | undefined>; stdio: 'ignore' },
  ): { kill(): boolean };
}

declare const process: { env: Record<string, string | undefined>; execPath: string };
