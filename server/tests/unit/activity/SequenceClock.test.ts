import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequenceClock } from '../../../src/activity/SequenceClock.js';

// research RA-05, REQ-ACT-18: times recorded by the server never go backwards.
describe('SequenceClock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never goes backwards over consecutive calls', () => {
    const clock = new SequenceClock();
    let previous = clock.stamp();
    for (let i = 0; i < 1000; i++) {
      const next = clock.stamp();
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('returns performance.timeOrigin + performance.now()', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1234.5);
    expect(new SequenceClock().stamp()).toBe(performance.timeOrigin + 1234.5);
  });

  it('keeps the previous value when performance.now moves back, and moves on when it catches up', () => {
    const now = vi.spyOn(performance, 'now');
    const clock = new SequenceClock();
    now.mockReturnValue(1000);
    const first = clock.stamp();
    now.mockReturnValue(500);
    expect(clock.stamp()).toBe(first);
    now.mockReturnValue(1500);
    expect(clock.stamp()).toBe(performance.timeOrigin + 1500);
  });
});
