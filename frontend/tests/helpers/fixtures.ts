// Small entity builders for component tests (independent of the mock fixtures).
import type {
  Activity,
  Group,
  ImportError,
  ImportSuccess,
  Question,
  QuestionResult,
  Spreadsheet,
  Submission,
} from '@quiz-buzzer/shared/entities';

export function makeQuestions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    type: 'SINGLE',
    text: `Question ${i + 1}`,
    subQuestions: [{ index: 1, blankCell: `G${i + 5}` }],
  }));
}

export function makeGroups(memberCounts: number[]): Group[] {
  return memberCounts.map((memberCount, i) => ({ number: i + 1, memberCount }));
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  const groups = overrides.groups ?? makeGroups([3, 2, 0]);
  return {
    groupCount: groups.length,
    phase: 'PREPARING',
    spreadsheet: {
      id: 'sheet',
      title: 'Sample Sheet Title',
      editable: true,
      worksheets: ['學習單'],
      selectedWorksheet: '學習單',
    },
    questions: makeQuestions(4),
    groups,
    ...overrides,
  };
}

export function makeSpreadsheet(overrides: Partial<Spreadsheet> = {}): Spreadsheet {
  return {
    id: 'sheet-a',
    title: 'Sheet A Title',
    editable: true,
    worksheets: ['學習單', '備註'],
    selectedWorksheet: '學習單',
    ...overrides,
  };
}

/** Questions 1 and 2 are groups with two sub-questions; 3 and 4 are single (6 blank cells). */
export function makeMixedQuestions(): Question[] {
  return [
    {
      number: 1,
      type: 'GROUP',
      text: 'Group question one',
      subQuestions: [
        { index: 1, blankCell: 'G5' },
        { index: 2, blankCell: 'G6' },
      ],
    },
    {
      number: 2,
      type: 'GROUP',
      text: 'Group question two',
      subQuestions: [
        { index: 1, blankCell: 'G8' },
        { index: 2, blankCell: 'G9' },
      ],
    },
    { number: 3, type: 'SINGLE', text: 'Single question three', subQuestions: [{ index: 1, blankCell: 'G11' }] },
    { number: 4, type: 'SINGLE', text: 'Single question four', subQuestions: [{ index: 1, blankCell: 'G13' }] },
  ];
}

export function makeImportSuccess(overrides: Partial<ImportSuccess> = {}): ImportSuccess {
  return {
    spreadsheet: makeSpreadsheet(),
    headerRow: 4,
    headerColumns: ['B', 'C', 'G'],
    questions: makeMixedQuestions(),
    ...overrides,
  };
}

export function makeImportError(overrides: Partial<ImportError> = {}): ImportError {
  return {
    code: 'NO_HEADER',
    reason: 'Header row was not found',
    foundHeaders: ['No.', 'Content', 'Answer here'],
    acceptedHeaders: ['Number column: 題號', 'Answer column: 作答'],
    fixSteps: ['Rename the headers', 'Press reload'],
    ...overrides,
  };
}

export function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    questionNumber: 1,
    groupNumber: 1,
    answers: ['Answer'],
    rank: 1,
    elapsedMs: 1000,
    judgement: 'PENDING',
    ...overrides,
  };
}

/** Builds a QuestionResult; behindFirstMs defaults to elapsedMs minus the first elapsedMs. */
export function makeQuestionResult(overrides: Partial<QuestionResult> = {}): QuestionResult {
  const submissions = overrides.submissions ?? [];
  return {
    questionNumber: 1,
    submissionCount: submissions.length,
    submissions,
    behindFirstMs: submissions.map((s) => s.elapsedMs - (submissions[0]?.elapsedMs ?? 0)),
    ...overrides,
  };
}
