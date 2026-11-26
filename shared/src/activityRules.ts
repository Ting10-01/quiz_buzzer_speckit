// 004 rules that 001's pages reference (spec REQ-ACT-02, REQ-ACT-23, "說明文字"; 001 change request C2).
// The server only uses the three group count constants.

export const GROUP_COUNT_MIN = 2;
export const GROUP_COUNT_MAX = 20;
export const GROUP_COUNT_DEFAULT = 6;

/** T-Setup "學生加入". */
export const JOIN_METHOD_TEXT =
  '學生在首頁選「我是學生」，再選自己的組別加入。同一組可以有多位同學，任何人送出都代表整組。第 1 題開放後不能換組。';

/** S-Wait "這一輪", shown below the question count. */
export const WAIT_ROUND_TEXT = '老師會一題一題開放。第 1 題開放後不能換組。';
