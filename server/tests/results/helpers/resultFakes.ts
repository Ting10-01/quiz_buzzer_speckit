import { GuidedNotesParser } from '../../../src/guided-notes/GuidedNotesParser.js';
import { ImportStore, type BlankMarkers } from '../../../src/guided-notes/ImportStore.js';
import { isImportError } from '@quiz-buzzer/shared/guards';
import type { ActivityState, ActivityStore, GroupMembership, SocketRef } from '../../../src/temp-deps/activity.js';
import type { SubmissionStore } from '../../../src/temp-deps/submission.js';
import type { ImportSuccess, Judgement, Spreadsheet, Submission } from '@quiz-buzzer/shared/entities';
import { FakeSpreadsheetReader } from '../../guided-notes/helpers/fakeSpreadsheetReader.js';
import { fixtureGrid, loadFixture } from '../../guided-notes/helpers/gridBuilder.js';

// Substitutes for 004's ActivityStore / GroupMembership and 005's SubmissionStore (temp-deps), plus
// 003's ImportStore and SpreadsheetReader filled with the "group + single" template
// (tests/guided-notes/fixtures/group.json: questions 1 and 2 are groups, 3 and 4 single).

export class FakeActivityStore implements ActivityStore {
  private revision = 0;

  constructor(private state: ActivityState | null = null) {}

  set(state: ActivityState | null): this {
    this.state = state;
    this.revision++;
    return this;
  }

  current(): ActivityState | null {
    return this.state;
  }

  version(): number {
    return this.revision;
  }

  subscribe(): () => void {
    return () => {};
  }
}

export class FakeGroupMembership implements GroupMembership {
  private readonly groups = new Map<string, number>();

  assign(socketId: string, groupNumber: number): this {
    this.groups.set(socketId, groupNumber);
    return this;
  }

  groupOf(socket: SocketRef): number | null {
    return this.groups.get(socket.id) ?? null;
  }
}

export class FakeSubmissionStore implements SubmissionStore {
  private readonly byQuestion = new Map<number, Submission[]>();

  set(questionNumber: number, submissions: Submission[]): this {
    this.byQuestion.set(questionNumber, submissions);
    return this;
  }

  list(questionNumber: number): Submission[] {
    return structuredClone(this.byQuestion.get(questionNumber) ?? []).sort((a, b) => a.rank - b.rank);
  }

  winner(questionNumber: number): Submission | null {
    return this.list(questionNumber).find((s) => s.judgement === 'ACCEPTED') ?? null;
  }
}

export const SPREADSHEET_ID = 'group-sheet-id-0001';
export const WORKSHEET = '學習單';

export const GROUP_SPREADSHEET: Spreadsheet = {
  id: SPREADSHEET_ID,
  title: '計算機概論基礎 學習單',
  editable: true,
  worksheets: [WORKSHEET],
  selectedWorksheet: WORKSHEET,
};

// What 003 saved when the teacher imported the template: blank cells G5, G6 (Q1), G8, G9 (Q2),
// G11 (Q3), G13 (Q4); markers "（1）" / "（2）" on the group sub-questions, "" on the others.
export function groupNotesImport(): { result: ImportSuccess; markers: BlankMarkers } {
  const parser = new GuidedNotesParser();
  const grid = fixtureGrid('group');
  const result = parser.parse(grid, GROUP_SPREADSHEET);
  if (isImportError(result)) throw new Error(`group fixture does not parse: ${result.code}`);
  return { result, markers: parser.markersOf(grid, result) };
}

export function importedStore(): ImportStore {
  const store = new ImportStore();
  const { result, markers } = groupNotesImport();
  store.save(result, markers);
  return store;
}

// app.spreadsheetReader substitute answering the unchanged template for SPREADSHEET_ID.
export function groupNotesReader(): FakeSpreadsheetReader {
  return new FakeSpreadsheetReader().set(SPREADSHEET_ID, loadFixture('group'));
}

export function submission(
  questionNumber: number,
  groupNumber: number,
  rank: number,
  elapsedMs: number,
  judgement: Judgement,
  answers: string[],
): Submission {
  return { questionNumber, groupNumber, answers, rank, elapsedMs, judgement };
}

export interface ResultScenario {
  activities: FakeActivityStore;
  submissions: FakeSubmissionStore;
}

// Q1: group 3 accepted. Q2: groups 1 and 5 rejected, then group 2 accepted.
function firstTwoQuestions(store: FakeSubmissionStore): FakeSubmissionStore {
  return store
    .set(1, [
      submission(1, 3, 1, 2000, 'ACCEPTED', ['CPU', '作業系統']),
      submission(1, 1, 2, 3000, 'REJECTED', ['GPU', '作業系統']),
    ])
    .set(2, [
      submission(2, 1, 1, 3200, 'REJECTED', ['流程圖', '佇列']),
      submission(2, 5, 2, 4100, 'REJECTED', ['演算法', '佇列']),
      submission(2, 2, 3, 5000, 'ACCEPTED', ['演算法', '堆疊']),
    ]);
}

function activityState(overrides: Partial<ActivityState>): ActivityState {
  return {
    spreadsheet: structuredClone(GROUP_SPREADSHEET),
    questions: groupNotesImport().result.questions,
    groupCount: 6,
    phase: 'PREPARING',
    openedAt: new Map(),
    endedAt: new Map(),
    ...overrides,
  };
}

// 4 questions, 6 groups: questions 1 and 2 have ended, question 3 is open (group 4 is still PENDING).
export function midActivityScenario(): ResultScenario {
  return {
    activities: new FakeActivityStore(
      activityState({
        phase: 'OPEN',
        currentQuestion: 3,
        openedAt: new Map([[1, 1000], [2, 20_000], [3, 40_000]]),
        endedAt: new Map([[1, 10_000], [2, 30_000]]),
      }),
    ),
    submissions: firstTwoQuestions(new FakeSubmissionStore()).set(3, [submission(3, 4, 1, 1200, 'PENDING', ['0'])]),
  };
}

// All 4 questions have ended. Q3 has no submissions. Q4: group 2 rejected, group 5 accepted, which
// finished the activity directly (so Q4 is not in endedAt), leaving group 3 UNJUDGED.
export function finishedActivityScenario(): ResultScenario {
  return {
    activities: new FakeActivityStore(
      activityState({
        phase: 'FINISHED',
        currentQuestion: 4,
        openedAt: new Map([[1, 1000], [2, 20_000], [3, 40_000], [4, 60_000]]),
        endedAt: new Map([[1, 10_000], [2, 30_000], [3, 50_000]]),
      }),
    ),
    submissions: firstTwoQuestions(new FakeSubmissionStore()).set(4, [
      submission(4, 2, 1, 3200, 'REJECTED', ['MAC']),
      submission(4, 5, 2, 5000, 'ACCEPTED', ['IP']),
      submission(4, 3, 3, 5000, 'UNJUDGED', ['IP']),
    ]),
  };
}
