import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/activity/CommandQueue.js';

// research RA-02, REQ-ACT-17: every state change runs synchronously, one at a time, in arrival order.
describe('CommandQueue', () => {
  it('runs commands one by one in call order and returns their results', () => {
    const queue = new CommandQueue();
    const order: string[] = [];
    const first = queue.run(() => {
      order.push('first');
      return 1;
    });
    const second = queue.run(() => {
      order.push('second');
      return 'two';
    });
    expect(first).toBe(1);
    expect(second).toBe('two');
    expect(order).toEqual(['first', 'second']);
  });

  it('runs a nested run in place, as part of the outer command (005 judging calls endQuestion)', () => {
    const queue = new CommandQueue();
    const order: string[] = [];
    const result = queue.run(() => {
      order.push('outer start');
      const inner = queue.run(() => {
        order.push('inner');
        return 'inner result';
      });
      order.push('outer end');
      return inner;
    });
    expect(result).toBe('inner result');
    expect(order).toEqual(['outer start', 'inner', 'outer end']);
  });

  it('throws when a command returns a Promise (no await inside the critical section)', () => {
    const queue = new CommandQueue();
    expect(() => queue.run(() => Promise.resolve(1))).toThrow();
    expect(() => queue.run(async () => 1)).toThrow();
  });

  it('passes on a command error and keeps working afterwards', () => {
    const queue = new CommandQueue();
    expect(() =>
      queue.run(() => {
        throw new Error('rule broken');
      }),
    ).toThrow('rule broken');
    expect(queue.run(() => 'next')).toBe('next');
    // Not stuck in the "already running" state: a Promise is still caught at the top level.
    expect(() => queue.run(() => Promise.resolve(1))).toThrow();
  });
});
