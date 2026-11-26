import { describe, expect, it } from 'vitest';
import {
  GROUP_COUNT_DEFAULT,
  GROUP_COUNT_MAX,
  GROUP_COUNT_MIN,
  JOIN_METHOD_TEXT,
  WAIT_ROUND_TEXT,
} from '@quiz-buzzer/shared/activityRules';

// Values copied from specs/004-buzzer-session/spec.md: REQ-ACT-02 and the "說明文字" section (REQ-ACT-23).
describe('activityRules', () => {
  it('allows 2 to 20 groups with 6 as the default (REQ-ACT-02)', () => {
    expect(GROUP_COUNT_MIN).toBe(2);
    expect(GROUP_COUNT_MAX).toBe(20);
    expect(GROUP_COUNT_DEFAULT).toBe(6);
  });

  it('provides the T-Setup join text from the spec (REQ-ACT-23)', () => {
    expect(JOIN_METHOD_TEXT).toBe(
      '學生在首頁選「我是學生」，再選自己的組別加入。同一組可以有多位同學，任何人送出都代表整組。第 1 題開放後不能換組。',
    );
  });

  it('provides the S-Wait round text from the spec (REQ-ACT-23)', () => {
    expect(WAIT_ROUND_TEXT).toBe('老師會一題一題開放。第 1 題開放後不能換組。');
  });
});
