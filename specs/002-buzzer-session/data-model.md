# Data Model: 搶答活動

**Feature**: `002-buzzer-session` | **Date**: 2026-11-15 | **Blueprint**: [`diagrams/002-class.puml`](../../diagrams/002-class.puml)

名稱、欄位與關係與 `diagrams/002-class.puml` 一一對應。標示「共用」的型別放在 `packages/shared/src/activity.ts`，前端與 003 直接引用。`QuestionSet`、`Question` 來自 001（[契約](../001-guided-notes-import/contracts/question-set.md)）。

## 狀態與列舉（共用）

| 型別 | 值 | 說明 |
| --- | --- | --- |
| `Phase` | `WAITING`、`RUNNING`、`ENDED` | 活動階段；只能往右推進（REQ-BUZ-05） |
| `QuestionPhase` | `PENDING`、`OPEN`、`CLOSED` | 每一題的狀態；同一時間最多一題 `OPEN` |
| `CloseReason` | `TEACHER`、`TIMEOUT` | 題目怎麼結束的 |
| `Role` | `TEACHER`、`STUDENT` | |
| `SubmitStatus` | `ACCEPTED`、`DUPLICATE`、`REJECTED` | |

### 狀態轉移

```text
Activity:  WAITING --openNextQuestion()（第一題）--> RUNNING --endActivity() 或最後一題結束--> ENDED
Question:  PENDING --openQuestion(n)--> OPEN --closeQuestion(TEACHER | TIMEOUT)--> CLOSED
規則：openNextQuestion 只能在「沒有 OPEN 的題目」時執行，開的是題號最小的 PENDING 題；
      最後一題 CLOSED 時 Activity 自動變為 ENDED；endActivity 時所有 PENDING 題目記為無人搶答。
```

## 領域物件（packages/server/src/buzz/domain）

### Activity

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `id` | string | 隨機 ID |
| `phase` | Phase | |
| `questionSet` | QuestionSet | 建立活動時從 001 取得，之後不變 |
| `groups` | Group[] | 2–20 組 |
| `fairMode` | FairModeSetting | 預設關閉 |
| `timeLimitSec` | number \| null | 5–600；`null` 表示不限時 |
| `currentQuestion` | number \| null | 目前 `OPEN` 的題號 |
| `questionStates` | Map<number, QuestionPhase> | 每題狀態 |
| `deadline` | number \| null | 目前題目的截止時間（毫秒時間戳），不限時為 `null` |
| `submissions` | Submission[] | 只能新增（NFR-03） |
| `results` | Map<number, QuestionResult> | 已結束題目的結果 |
| `nextSeq` | number（私有） | 下一個順位序號，從 1 開始 |

方法：`openQuestion(number, now)`、`closeQuestion(result)`、`end()`、`takeNextSeq()`。

### Group（共用）

`id`（`"g1"`…）、`name`（`"第 1 組"`…）。

### FairModeSetting（共用）

`enabled: boolean`、`windowSeconds: number`（1–10，預設 3）。

### Submission

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `submissionId` | string | 學生端產生的 UUID；重複抵達只記一次 |
| `groupId` | string | |
| `questionNumber` | number | 必須等於當下 `currentQuestion` 且該題 `OPEN` |
| `answers` | Record<slotId, string> | 該題每個 slot 都要有；去除前後空白後 1–200 字 |
| `seq` | number | 系統接受時取得，唯一、連續遞增 |
| `receivedAt` | number | `SequenceClock.stamp()`，隨 `seq` 單調不減 |

### QuestionResult（共用，003 使用）

`questionNumber`、`ranking: Submission[]`（依 `seq` 排序）、`winnerGroupId: string | null`、`closeReason: CloseReason`。

## 指令（Command）

| 型別 | 欄位 | 發出者 |
| --- | --- | --- |
| `Command`（抽象） | `issuedBy: Participant \| null` | |
| `OpenNextQuestionCommand` | — | 老師 |
| `CloseQuestionCommand` | `reason: CloseReason` | 老師（`TEACHER`）或 `QuestionTimer`（`TIMEOUT`，`issuedBy = null`） |
| `EndActivityCommand` | — | 老師 |
| `SubmitCommand` | `submissionId`、`questionNumber`、`answers` | 學生 |
| `CommandResult` | `ok`、`message?` | 回覆 |
| `SubmitResult`（共用） | `status`、`reason?`、`receivedAt?` | 回覆學生；**不含順位**（R9 隔離） |

## 畫面資料（共用，伺服器 → 前端）

| 型別 | 欄位 |
| --- | --- |
| `QuestionOutline` | `questionNumber`、`slotLabels: string[]`、`slotTexts: (string \| null)[]` |
| `GroupStatus` | `groupId`、`name`、`onlineCount`、`submittedCount` |
| `TeacherView` | `phase`、`current: QuestionOutline \| null`、`remainingSec: number \| null`、`currentRanking: Submission[]`、`waitingGroups: string[]`、`closedResults: QuestionResult[]`、`groups: GroupStatus[]` |
| `OwnSubmission` | `questionNumber`、`answers`、`receivedAt` — **沒有 `seq`** |
| `PublicResult` | `questionNumber`、`winnerGroupName: string \| null`、`answers` |
| `StudentView` | `phase`、`groupId`、`current: QuestionOutline \| null`、`remainingSec: number \| null`、`ownSubmission: OwnSubmission \| null`、`closedResults: PublicResult[]` |

`VisibilityFilter.studentView()` 只放入上表欄位；其他組的送出、數量與順位在伺服器端就不會進入物件（REQ-BUZ-16）。整輪結束後的完整順位由 003 的結果 API 提供。

## 服務與基礎設施（packages/server/src/buzz、session）

| 類別 | 主要成員 | 說明 |
| --- | --- | --- |
| `CommandQueue` | `enqueue(command): CommandResult` | 同步逐一處理（research R1） |
| `ActivityService` | `createActivity(...)`、`join`、`changeGroup`、`openNextQuestion`、`closeQuestion(reason)`、`endActivity`、`submit` | 所有狀態變更的入口 |
| `QuestionTimer` | `start(questionNumber, deadline)`、`cancel()` | 截止時 enqueue `CloseQuestionCommand(TIMEOUT)` |
| `BuzzEngine` | `submit(activity, command): SubmitResult` | 驗證、取序號、寫入紀錄 |
| `SequenceClock` | `stamp(): number` | 單調不減的接受時間 |
| `RankingPolicy`（介面） | `resolve(question, submissions, winsSoFar): QuestionResult` | 實作：`FirstArrivalPolicy`、`FairPolicy(windowSeconds)` |
| `VisibilityFilter` | `teacherView(activity)`、`studentView(activity, groupId)` | 依角色產生畫面資料 |
| `Broadcaster` | `notify(activity)`、`reply(connectionId, result)` | 非同步推送；每連線一個 `Outbox` |
| `Outbox` | `connectionId`、`pending`、`latestViewOnly` | 慢連線只塞住自己（research R4） |
| `SessionGateway` | `onConnect`、`onCommand` | Socket.IO 事件的入口，驗證身分後轉給 `CommandQueue` |
| `Participant` | `connectionId`、`role`、`groupId?` | |
| `TeacherCredential` | `token` | 見 research R6 |
| `ActivityStore` | `current()`、`replace(activity)` | 記憶體；同一時間只有一個活動 |

## 驗證規則摘要

| 規則 | 來源 |
| --- | --- |
| 組數 2–20；每題秒數 5–600 或不限時；公平模式視窗 1–10 秒 | REQ-BUZ-03、17、22 |
| 送出只接受目前 `OPEN` 的題目，其他一律 `REJECTED` | REQ-BUZ-08、13、AC-31 |
| 同組同題只接受第一筆；同一 `submissionId` 回 `DUPLICATE` | REQ-BUZ-09、14 |
| 題組每個 slot 都要有答案；答案去空白後 1–200 字 | REQ-BUZ-10、15 |
| 第 1 題開放後不能換組 | REQ-BUZ-04 |
| 只有老師憑證能執行開題、結束、結束活動 | REQ-BUZ-02 |
