// Demonstration data for the 001 mock implementations (spec M1–M8, data-model section 3).
// These are sample values for showing the screens, NOT defaults of the real system.
// Content follows docs/design/dark/T-Import.html, T-ImportError.html and T-Live.html.
import {
  ActivityPhase,
  QuestionType,
  type Activity,
  type Group,
  type ImportError,
  type ImportSuccess,
  type Question,
  type Spreadsheet,
  type Submission,
  type TeacherAccount,
} from '@quiz-buzzer/shared/entities';

/** Option ids of the mock account chooser (M1). */
export const ACCOUNT_CHOICE = {
  TEACHER: 'mock-teacher',
  NON_TEACHER: 'mock-non-teacher',
  CANCEL: 'cancel',
} as const;

/** Spreadsheet ids, also used as option ids of the mock file chooser (M2). */
export const SPREADSHEET_ID = {
  GROUP_AND_SINGLE: 'group-and-single',
  SINGLE_ONLY: 'single-only',
  BAD_HEADER: 'bad-header',
} as const;

const DEMO_ACTIVITY_SPREADSHEET_ID = 'demo-activity';

/** A fixture submission before rank and judgement are assigned (rank follows array order). */
export type FixtureSubmission = Pick<Submission, 'groupNumber' | 'answers' | 'elapsedMs'>;

const teacherAccount: TeacherAccount = { name: '模擬老師', email: 'teacher@example.com' };

const spreadsheets: Spreadsheet[] = [
  {
    id: SPREADSHEET_ID.GROUP_AND_SINGLE,
    title: '題組＋單題範本',
    editable: true,
    worksheets: ['學習單', '備註'],
    selectedWorksheet: '學習單',
  },
  {
    id: SPREADSHEET_ID.SINGLE_ONLY,
    title: '單題範本',
    editable: false,
    worksheets: ['學習單'],
    selectedWorksheet: '學習單',
  },
  {
    id: SPREADSHEET_ID.BAD_HEADER,
    title: '表頭錯誤範例',
    editable: true,
    worksheets: ['學習單'],
    selectedWorksheet: '學習單',
  },
];

const texts = {
  cpu: '根據文章第一段，小明升級的電腦「大腦」硬體，其英文簡稱是什麼？',
  os: '而他安裝的 Windows 負責管理電腦的軟硬體資源，這種系統軟體統稱為什麼？',
  algorithm: '為了處理角色移動，小明設計了步驟明確的邏輯，這在程式設計中稱為什麼？',
  stack: '而他用來實作「上一步／復原」功能，採用了「後進先出」機制的資料結構，中文稱為什麼？',
  binary: '無論小明寫的高階語言多麼複雜，最終都會被轉換成由數字 1 和哪一個數字構成的二進位訊號？',
  ip: '專案最後的連線失敗，是因為小明的筆電沒有成功取得一組在網路世界中用來辨識身分的獨一無二之編碼，這個號碼被稱為什麼位址？',
};

const groupAndSingleQuestions: Question[] = [
  {
    number: 1,
    type: QuestionType.GROUP,
    text: `${texts.cpu}\n${texts.os}`,
    subQuestions: [
      { index: 1, blankCell: 'G5' },
      { index: 2, blankCell: 'G6' },
    ],
  },
  {
    number: 2,
    type: QuestionType.GROUP,
    text: `${texts.algorithm}\n${texts.stack}`,
    subQuestions: [
      { index: 1, blankCell: 'G8' },
      { index: 2, blankCell: 'G9' },
    ],
  },
  {
    number: 3,
    type: QuestionType.SINGLE,
    text: texts.binary,
    subQuestions: [{ index: 1, blankCell: 'G11' }],
  },
  {
    number: 4,
    type: QuestionType.SINGLE,
    text: texts.ip,
    subQuestions: [{ index: 1, blankCell: 'G13' }],
  },
];

const singleOnlyQuestions: Question[] = [
  texts.cpu,
  texts.os,
  texts.algorithm,
  texts.stack,
  texts.binary,
  texts.ip,
].map((text, i) => ({
  number: i + 1,
  type: QuestionType.SINGLE,
  text,
  subQuestions: [{ index: 1, blankCell: `G${i + 5}` }],
}));

const badHeaderError: ImportError = {
  code: 'NO_HEADER',
  reason:
    '在「學習單」工作表找不到同時寫著題號欄與作答欄表頭的那一列，所以沒有匯入任何題目，原本的題目清單也沒有變動。',
  foundHeaders: ['No.', '內容', '學生填寫'],
  acceptedHeaders: [
    '題號欄：題號、編號、題次',
    '作答欄：作答、答案、回答',
    '題目欄：題目、問題、題幹（可以沒有）',
  ],
  fixSteps: [
    '在 Google 試算表把題號欄的表頭改成「題號」，作答欄改成「作答」（或上表的其他寫法）。',
    '題號欄與作答欄的表頭要在同一列。',
    '回到這裡按「重新讀取」。',
  ],
};

const importResults: Record<string, ImportSuccess | ImportError> = {
  [SPREADSHEET_ID.GROUP_AND_SINGLE]: {
    spreadsheet: spreadsheets[0],
    headerRow: 4,
    headerColumns: ['B', 'C', 'G'],
    questions: groupAndSingleQuestions,
  },
  [SPREADSHEET_ID.SINGLE_ONLY]: {
    spreadsheet: spreadsheets[1],
    headerRow: 4,
    headerColumns: ['B', 'C', 'G'],
    questions: singleOnlyQuestions,
  },
  [SPREADSHEET_ID.BAD_HEADER]: badHeaderError,
};

/** Joined members per group; group 6 has nobody (M3). */
const groupMembers: Group[] = [3, 2, 3, 2, 3, 0].map((memberCount, i) => ({
  number: i + 1,
  memberCount,
}));

/** The fixed activity seen by the home page and student pages (M3, M7): 4 questions, 6 groups. */
const activity: Activity = {
  groupCount: 6,
  phase: ActivityPhase.PREPARING,
  spreadsheet: {
    id: DEMO_ACTIVITY_SPREADSHEET_ID,
    title: '計算機概論基礎 學習單',
    editable: true,
    worksheets: ['學習單', '備註'],
    selectedWorksheet: '學習單',
  },
  questions: groupAndSingleQuestions,
  groups: groupMembers,
};

const groupAndSingleSubmissions: Record<number, FixtureSubmission[]> = {
  1: [
    { groupNumber: 2, answers: ['CPU', '作業系統'], elapsedMs: 6204 },
    { groupNumber: 4, answers: ['CPU', '作業系統'], elapsedMs: 8517 },
    { groupNumber: 1, answers: ['CPU', '驅動程式'], elapsedMs: 12030 },
    { groupNumber: 3, answers: ['GPU', '作業系統'], elapsedMs: 15880 },
  ],
  2: [
    { groupNumber: 5, answers: ['演算法', '堆疊'], elapsedMs: 10412 },
    { groupNumber: 2, answers: ['演算法', '佇列'], elapsedMs: 13276 },
  ],
  3: [
    { groupNumber: 1, answers: ['0'], elapsedMs: 5381 },
    { groupNumber: 3, answers: ['0'], elapsedMs: 7902 },
  ],
  // The last question has no submissions (M4).
  4: [],
};

/** Submissions shown when a question opens, by spreadsheet id then question number (M4). */
const submissionsByQuestion: Record<string, Record<number, FixtureSubmission[]>> = {
  [SPREADSHEET_ID.GROUP_AND_SINGLE]: groupAndSingleSubmissions,
  [DEMO_ACTIVITY_SPREADSHEET_ID]: groupAndSingleSubmissions,
  [SPREADSHEET_ID.SINGLE_ONLY]: {
    1: [
      { groupNumber: 2, answers: ['CPU'], elapsedMs: 4810 },
      { groupNumber: 4, answers: ['CPU'], elapsedMs: 7395 },
    ],
    2: [
      { groupNumber: 1, answers: ['作業系統'], elapsedMs: 6122 },
      { groupNumber: 5, answers: ['作業系統'], elapsedMs: 9047 },
    ],
    3: [
      { groupNumber: 5, answers: ['演算法'], elapsedMs: 8263 },
      { groupNumber: 3, answers: ['流程圖'], elapsedMs: 11518 },
    ],
    4: [
      { groupNumber: 3, answers: ['堆疊'], elapsedMs: 5934 },
      { groupNumber: 2, answers: ['堆疊'], elapsedMs: 9871 },
    ],
    5: [
      { groupNumber: 1, answers: ['0'], elapsedMs: 3702 },
      { groupNumber: 4, answers: ['0'], elapsedMs: 6455 },
    ],
    // The last question has no submissions (M4).
    6: [],
  },
};

export const MockFixtures = {
  teacherAccount,
  spreadsheets,
  importResults,
  activity,
  groupMembers,
  submissionsByQuestion,
};
