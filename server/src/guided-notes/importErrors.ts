import type { ImportError } from '../temp-shared/entities.js';

// Every ImportError the import can return (data-model ImportErrorCode). All teacher-facing
// texts live here so that each code has a reason and at least one fix step (SC-003).

export const ImportErrorCode = {
  NO_HEADER: 'NO_HEADER',
  NO_QUESTIONS: 'NO_QUESTIONS',
  INVALID_NUMBERING: 'INVALID_NUMBERING',
  TOO_MANY_QUESTIONS: 'TOO_MANY_QUESTIONS',
  NO_BLANK: 'NO_BLANK',
  NO_ACCESS: 'NO_ACCESS',
  NO_WORKSHEET: 'NO_WORKSHEET',
} as const;
export type ImportErrorCode = (typeof ImportErrorCode)[keyof typeof ImportErrorCode];

export const ACCEPTED_HEADERS = [
  '題號欄：題號、編號、題次',
  '作答欄：作答、答案、回答',
  '題目欄（可以沒有）：題目、問題、題幹',
];

export interface NumberedRow {
  number: number;
  row: number;
}

function importError(code: ImportErrorCode, reason: string, fixSteps: string[]): ImportError {
  return { code, reason, foundHeaders: [], acceptedHeaders: [], fixSteps };
}

// Server-side stand-in for 001's `isImportError` (shared/src/guards.ts is not written yet).
export function isImportError(value: object): value is ImportError {
  return 'code' in value;
}

export function noHeader(worksheet: string, foundHeaders: string[]): ImportError {
  return {
    code: ImportErrorCode.NO_HEADER,
    reason: `在「${worksheet}」工作表找不到同時寫著題號欄與作答欄表頭的列，所以沒有匯入任何題目。`,
    foundHeaders: [...foundHeaders],
    acceptedHeaders: [...ACCEPTED_HEADERS],
    fixSteps: [
      '把題號欄的表頭改成「題號」「編號」或「題次」。',
      '把作答欄的表頭改成「作答」「答案」或「回答」。',
      '改好後按「重新讀取」。',
    ],
  };
}

export function noQuestions(worksheet: string, headerRow: number): ImportError {
  return importError(ImportErrorCode.NO_QUESTIONS, `「${worksheet}」工作表的表頭（第 ${headerRow} 列）以下沒有任何題號。`, [
    '在題號欄填上正整數題號後按「重新讀取」。',
  ]);
}

export function invalidNumbering(number: number, row: number, previous: NumberedRow): ImportError {
  const reason =
    number === previous.number
      ? `第 ${row} 列的題號 ${number} 和第 ${previous.row} 列重複。`
      : `第 ${row} 列的題號 ${number} 比上一題（第 ${previous.row} 列的題號 ${previous.number}）小，題號必須由上到下遞增。`;
  return importError(ImportErrorCode.INVALID_NUMBERING, reason, [
    '修正題號，讓題號不重複且由上到下遞增（可以跳號），再按「重新讀取」。',
  ]);
}

export function tooManyQuestions(count: number): ImportError {
  return importError(ImportErrorCode.TOO_MANY_QUESTIONS, `這份學習單有 ${count} 題，超過上限 200 題。`, [
    '把學習單拆成兩份，各自匯入。',
  ]);
}

export function noBlank(number: number, row: number): ImportError {
  return importError(
    ImportErrorCode.NO_BLANK,
    `第 ${number} 題（第 ${row} 列）沒有自己的填空格，作答欄的儲存格和上一列合併在一起。`,
    ['取消作答欄的合併，讓每題（每個小題）都有自己的填空格，再按「重新讀取」。'],
  );
}

export function noAccess(): ImportError {
  return importError(ImportErrorCode.NO_ACCESS, '目前登入的 Google 帳號讀不到這份試算表。', [
    '確認試算表還在你的雲端硬碟中，按「重新挑選」從 Google 雲端硬碟再挑一次。',
  ]);
}

export function noWorksheet(worksheet: string): ImportError {
  return importError(ImportErrorCode.NO_WORKSHEET, `試算表中找不到「${worksheet}」工作表，可能已被改名或刪除。`, [
    '按「重新挑選」重新選擇這份試算表。',
  ]);
}
