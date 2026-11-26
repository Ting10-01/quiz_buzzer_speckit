// Playwright runs e2e helpers in Node, but frontend has no Node types (like playwright.config.ts,
// declare only what is used).
declare module 'node:child_process' {
  interface Readable {
    on(event: 'data', listener: (chunk: { toString(): string }) => void): void;
  }
  export function spawn(
    command: string,
    args: string[],
    options: { cwd: string; env: Record<string, string | undefined>; stdio: 'ignore' | ['ignore', 'pipe', 'ignore'] },
  ): { kill(): boolean; stdout: Readable | null; on(event: 'exit', listener: () => void): void };
}

declare const process: {
  env: Record<string, string | undefined>;
  execPath: string;
  on(event: 'exit', listener: () => void): void;
};
