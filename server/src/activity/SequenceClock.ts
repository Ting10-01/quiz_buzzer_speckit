// Milliseconds that never go backwards (research RA-05, REQ-ACT-18). performance.now() is monotonic and
// unaffected by system clock changes; max() also covers anything that would still move it back.
// 005 stamps submissions with the same clock, so elapsed time = submission - openedAt.
export class SequenceClock {
  private last = 0;

  stamp(): number {
    this.last = Math.max(this.last, performance.timeOrigin + performance.now());
    return this.last;
  }
}
