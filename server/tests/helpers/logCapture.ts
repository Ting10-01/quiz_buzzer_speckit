import { Writable } from 'node:stream';

// A pino destination that keeps every log line in memory so tests can search it.
export class LogCapture extends Writable {
  readonly lines: string[] = [];

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
    done();
  }

  get text(): string {
    return this.lines.join('\n');
  }

  parsed(): Record<string, unknown>[] {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}
