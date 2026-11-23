import { describe, expect, it } from 'vitest';
import { backupName, composeCellText } from '../../../src/results/cellText.js';

describe('composeCellText (AC-13, REQ-RES-08)', () => {
  it('puts the sub-question marker before the answer', () => {
    expect(composeCellText('（1）', 'CPU')).toBe('（1）CPU');
  });

  it('writes only the answer when the cell has no marker', () => {
    expect(composeCellText('', 'IP')).toBe('IP');
  });
});

describe('backupName (AC-17, REQ-RES-13)', () => {
  // Local time 2026-11-23 09:05.
  const now = new Date(2026, 10, 23, 9, 5, 42);

  it('names the backup <worksheet>-備份-YYYYMMDD-HHmm in local time', () => {
    expect(backupName('學習單', now, ['學習單'])).toBe('學習單-備份-20261123-0905');
  });

  it('adds -2, then -3 when the name is taken', () => {
    const base = '學習單-備份-20261123-0905';
    expect(backupName('學習單', now, ['學習單', base])).toBe(`${base}-2`);
    expect(backupName('學習單', now, ['學習單', base, `${base}-2`])).toBe(`${base}-3`);
  });

  it('takes the first free suffix', () => {
    const base = '學習單-備份-20261123-0905';
    expect(backupName('學習單', now, [base, `${base}-3`])).toBe(`${base}-2`);
  });
});
