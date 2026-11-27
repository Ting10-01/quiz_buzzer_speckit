import { describe, expect, it } from 'vitest';
import { SubmissionVisibility } from '../../../src/submission/SubmissionVisibility.js';
import { submissionRecord } from '../../helpers/submissionRecord.js';

// data-model section 4 "SubmissionVisibility"; REQ-SUB-16, research RD-06.
describe('SubmissionVisibility', () => {
  const visibility = new SubmissionVisibility();
  const record = submissionRecord({
    questionNumber: 1,
    groupNumber: 3,
    answers: ['光合作用', '葉綠體'],
    rank: 4,
    elapsedMs: 3210,
    judgement: 'REJECTED',
  });

  it('forTeacher keeps the recorded rank and leaves out requestId and acceptedAt', () => {
    expect(visibility.forTeacher(record)).toEqual({
      questionNumber: 1,
      groupNumber: 3,
      answers: ['光合作用', '葉綠體'],
      rank: 4,
      elapsedMs: 3210,
      judgement: 'REJECTED',
    });
  });

  it('forStudent sets rank to 0 and is otherwise the same as forTeacher', () => {
    expect(visibility.forStudent(record)).toEqual({ ...visibility.forTeacher(record), rank: 0 });
  });

  it('forStudent hides the rank whatever it is', () => {
    for (const rank of [1, 2, 20]) {
      expect(visibility.forStudent(submissionRecord({ rank })).rank).toBe(0);
    }
  });

  it('does not share the answers array with the record', () => {
    const teacher = visibility.forTeacher(record);
    teacher.answers.push('多的');
    expect(record.answers).toEqual(['光合作用', '葉綠體']);
  });
});
