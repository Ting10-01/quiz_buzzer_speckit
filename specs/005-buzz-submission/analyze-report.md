# Specification Analysis Report: 005 搶答與判定

**Date**: 2026-11-21（第 4 次：2026-11-22；第 5 次：2026-11-27） | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、tasks.md、research.md、data-model.md、contracts/、diagrams/005-*.puml、constitution.md；交界對照 001 最終版（PR #10）、`docs/feature-split.md` 最新版、004 `contracts/server-modules.md`、`socket-events.md`，002 `contracts/server-extension.md`、`socket-handshake.md`、`tasks.md`

## 第 1 次分析的發現（已修正）

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| C1 | Constitution | CRITICAL | spec.md 原 User Story 5；tasks.md 原 Phase 7 | 原則 VIII 要求每個 User Story 有正常與邊界案例的自動化測試；原 US5（說明文字）只有一個文字檢查 | AC-26 併入 US2，檢查任務移到 Polish；不再有 US5 |
| U1 | Inconsistency | MEDIUM | tasks.md | Foundational 的組裝要通知 `SubmissionNotifier`，但 Notifier 原本排在 US2 才實作 | Notifier 的測試與實作移到 Foundational |
| F1 | Inconsistency | MEDIUM | diagrams/005-class.puml；data-model.md | 類別圖缺 `SubmissionEngine → SubmissionVisibility` | 補上關聯，重新產生 PNG |
| T1 | Traceability | MEDIUM | spec.md REQ-SUB-NFR-04 | 沒有標出 `docs/assignment.md` 編號 | 改為「R10、高併發」 |
| F2 | Inconsistency | LOW | plan.md Scale/Scope | 類別數與類別圖不符 | 已改 |

## 第 2 次分析：對齊 002、004 的契約（已修正）

| ID | Category | Severity | Summary | 修正 |
|----|----------|----------|---------|------|
| X1 | Inconsistency | HIGH | 005 自建 `CommandQueue`、`SequenceClock`，與 004 擁有的佇列分成兩條 | 改用 004 的 `CommandQueue.run`、`SequenceClock.stamp()`；刪除 4 個任務；開放時間改讀 004 `ActivityState.openedAt` |
| X2 | Inconsistency | MEDIUM | 004 名稱不同（`ActivityManager.endQuestion`、`ActivityStore.subscribe`、`RealtimeClient`） | 全部改名 |
| X3 | Inconsistency | MEDIUM | 組別房間、`TEACHER_ROOM`、`app.io`、`{ code, message }`、`app.register`、`ApiClient` 與 002／004 不一致 | 全部對齊；組別通知改為掃描連線 |

第 3 次分析（第 2 次修正後重跑）：0 CRITICAL、0 HIGH、0 MEDIUM。

## 第 4 次分析（配合 001 最終版）

### 發現與修正

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| P1 | Inconsistency | HIGH | spec、data-model、contracts、類別圖、tasks | 001 最終版的 `SubmissionService` 新增 `getGroupSubmission`、`onGroupSubmitted`，`judge` 改回傳 `JudgeOutcome { submissions, activity }`；005 只實作舊的五個方法、`judge` 回傳 `Submission[]` | 新增 REQ-SUB-20（組員送出通知）、REQ-SUB-21（取得本組送出）、AC-27、AC-28；`judge` 回傳 `JudgeOutcome`（`activity` 取自 004 `ActivityManager.snapshot(Audience.TEACHER)`）；新增 Socket.IO 事件 `submission:own`、`submission:groupSubmitted`；三張圖、data-model、contracts、tasks 同步 |
| P2 | Inconsistency | HIGH | spec AC-08、AC-11、REQ-SUB-15；quickstart；時序圖 | 被拒絕後回到作答頁的被拒絕狀態、被接受時顯示「老師已接受本組答案」，與 001 FR-055、FR-056 矛盾（拒絕停在等待判定頁；接受由階段同步切到本題結果） | 照 001 最終版改寫 |
| P3 | Inconsistency | MEDIUM | spec「需請 001 修改」 | 8 項中 7 項已由 001 最終版處理或依 2026-11-22 使用者決定改為配合現況 | 只留 `Submission.rank` 可選一項；其餘改寫進「001 交給 005 的事項」與 Assumptions 的已知限制 |
| P4 | Inconsistency | MEDIUM | spec REQ-SUB-16、research RD-06、data-model、tasks T006、T025、T027 | 學生的 `Submission` 不放 `rank` 需要 001 先改實體，型別無法通過 | 依使用者決定：001 改之前學生的 `rank` 一律填 0；新增後續任務 T035（001 改完後改為不放） |
| P5 | Inconsistency | MEDIUM | spec REQ-SUB-05、AC-02、AC-06、AC-07、contracts | `ValidationError.field` 用 `answers[i]`／`submit`，並假設頁面會依 `field` 顯示在對應位置與停用按鈕；001 頁面的按鈕一律可用、錯誤一律顯示在第一個答案欄旁，模擬實作用 `answers.0` | 改用 `answers.<i>`／`answers`；D14 改由伺服器驗證落實；已知限制寫進 Assumptions |
| P6 | Inconsistency | MEDIUM | diagrams/005-class.png | 類別圖實際寬 7,249 px，超過 PlantUML 預設的 4,096 px 上限，PNG 右側被截掉（前幾輪也有） | 類別圖改為 `left to right direction` 並 `scale max 4000 width`；重新產生後三張 PNG 寬度為 4,000、2,940、2,905 px，完整無截斷 |
| P7 | Inconsistency | MEDIUM | tasks T024；plan 藍圖對照；research RD-08 | 001 新增 mock 控制 `teammateControl`，換綁時沒有移除 | 一併移除 |
| P8 | Inconsistency | LOW | tasks T022 | 002 老師路由清單測試的任務編號寫成 T039，002 tasks 實際是 T043 | 改為 T043 |
| P9 | Underspecification | LOW | spec D 表、Clarifications | D11、D13、D16、D17 在 001 最終版已由 feature-split 第 4 節決定或標為不適用 | D 表改成「001 最終版的狀態」與「005 的處理」兩欄，引用 feature-split |

### 修正後重跑

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| L2 | Coverage | LOW | spec.md SC-006 | 「不超過 2 個操作步驟」只有人工驗證（T033） | 屬於使用體驗指標，人工驗證即可 |
| L4 | Dependency | LOW | spec「需請 001 修改」；tasks T035 | `Submission.rank` 改成可選要等 001；在那之前學生收到 0 | 已在 PR #10 留言；T035 等 001 改完再做 |
| L5 | Dependency | LOW | plan 交界假設 A-3 | 005 在 `CommandQueue.run` 內呼叫 004 的 `ActivityManager.snapshot(Audience.TEACHER)` 組 `JudgeOutcome.activity`；004 文件寫的用途是「連線時第一次推送」 | 請 004 確認可在 `run` 內呼叫（只讀，無副作用） |
| L6 | Usability | LOW | spec Assumptions | 配合 001 現況：「整組送出」有空白格時仍可按；驗證錯誤一律顯示在第一個答案欄旁 | 已寫為已知限制；要改善需先改 001 |

## 第 5 次分析（2026-11-27，對照 001–004 完成後的實際程式）

001–004 已實作完成；005 的文件停在 2026-11-22。這次對照 `main` 目前的 001 spec 與契約、004 `server/src/activity/`、`frontend/src/services/` 的實際程式。處理方式由使用者決定（S1–S3），其餘照建議修改。

### 發現與修正

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| S1 | Process | HIGH | 分支、`.specify/feature.json` | 分支 `005-buzzer-submission` 與 `specs/005-buzz-submission` 不同名（CLAUDE.md 第 2 節）；`.specify/feature.json`（不進版控）仍指向 004，speckit 指令都會作用在 004 | 分支改名為 `005-buzz-submission`；`feature.json` 改指 005 |
| S2 | Inconsistency | HIGH | tasks T024、research RD-08 | 004 RA-14 在組合根留下 `bridgeMocksToActivity`，換綁時沒有處理；換綁後 `MockResultService` 讀不到送出，結果頁一律「沒有組別送出」 | 使用者決定 A：T024 刪除橋接中跟送出有關的部分，保留 `teacherActivity` 與 `lastImport`；結果頁的落差列為已知限制（spec Session 2026-11-27、Assumptions） |
| S3 | Coverage | HIGH | tasks | 換綁後依賴模擬控制的 001 測試會失敗，沒有任務處理（004 以 T061、T063 處理同類問題） | 新增 T041（Phase 3，送出相關）、T043（Phase 4，判定相關）：只改走法與輔助檔，不改頁面與斷言；必須改斷言的先列出由使用者決定 |
| M1 | Coverage | MEDIUM | spec | 001 FR-015、D21：老師在搶答中重新登入後回到控制台；spec 沒有這個情境 | 新增 AC-29、Edge Case、REQ-SUB-10 補充；T019 以 `rotateTeacher()` 測試 |
| M2 | Inconsistency | MEDIUM | data-model、research RD-08、tasks | 老師端方法沒有呼叫 `RealtimeClient.followTeacherCredential()`（004 T062），連線可能不在 `TEACHER_ROOM` | data-model、contracts 規則 7、類別圖、時序圖、T038、T040、T020、T023 補上 |
| M3 | Inconsistency | MEDIUM | 類別圖、data-model | `ActivityStore.subscribe` 的 listener 參數寫成 `ActivityState`，實際為 `version: number` | 改為 `onActivityChange(version)`，以 `current()` 讀狀態；重新產生 PNG |
| M4 | Inconsistency | MEDIUM | research RD-05、T008、T029 | 推送「立刻送出」會在 `CommandQueue.run` 內 `emit`，違反 004 RA-04 | 推送一律 `setImmediate` 排程；T029 改為 `run` 內不得 `emit`；contracts 規則 6、類別圖 note |
| M5 | Duplication | MEDIUM | T003、T014、T020、T032 | 另寫測試伺服器與假 `RealtimeClient`，與 004 既有輔助檔重複 | 改為擴充 `activityTestServer.ts`，使用 `fakeRealtimeClient.ts` 與 004 的 E2E 測試伺服器 |
| L1 | Inconsistency | LOW | T002、plan、quickstart、RD-10 | `socket.io-client` 已是 devDependency；指令命名與 004 不一致 | 改為 `test:load:submission` |
| L2 | Inconsistency | LOW | T030 | 壓力測試結果寫進人工驗證紀錄；004 改為獨立的 `load-test.md` | 改記在 `load-test.md` |
| L3 | Dependency | LOW | plan 交界假設、spec「相依」、contracts | A-1～A-4、A-6 已可確認；004 以 `app.activity` 提供模組；「PR #10 最終版」已過時 | plan 加「狀態」欄；`app.register(submissionRoutes)` 改從 `app.activity` 取得；改為以 `main` 目前的版本為準 |
| L4 | Process | LOW | tasks | CLAUDE.md 步驟 6 的頁面確認規則沒有說明 | tasks 註明 005 不改頁面，不適用 |

### 依使用者要求新增

- 每個 User Story 的 Phase 以人工驗證結尾：T042（US1）、T044（US2）、T045（US3）、T046（US4）；quickstart 的人工驗證情境依 User Story 分組（情境 1–16），T033 在 Polish 全部再走一次。
- 為了讓 US1 能在瀏覽器驗證，組合根換綁（T024）與老師的答案列表（`GET` 路由 T039、`listSubmissions`／`onSubmissionsChange` T040，對應 US1 的 AC-03）提前到 Phase 3；判定（`POST` 路由、`judge`）留在 Phase 4。Phase 3 與 Phase 4 之間，`judge` 暫時以 `UnexpectedError`「判定功能尚未完成（005 Phase 4）」reject（2026-11-27 使用者決定，不把判定提前、不交給模擬實作）：控制台在共通錯誤訊息區顯示訊息，列表與階段不變，題目以 004 的「結束這一題」結束；T038 測試這個錯誤，T023 換成真正的實作並刪除這段程式與測試案例。
- 任務編號 T036 未使用（新增任務從 T037 起，避免與舊編號混淆）。

### 修正後重跑

以腳本核對：spec 的 AC-01～29 都出現在 tasks；tasks 引用的任務編號都有定義（T061 是 004 的任務）；文件中已沒有 `test:load -w`、`submissionTestServer`、`ActivityState [0..1]) =>`、「立刻送出」等過時寫法。

| ID | Category | Severity | Summary | Recommendation |
|----|----------|----------|---------|----------------|
| L4 | Dependency | LOW | `Submission.rank` 在 001 仍為必填，T035 繼續等待 | 不變 |
| L6 | Usability | LOW | 已知限制：空白格仍可按送出、錯誤顯示在第一個答案欄旁 | 不變 |
| L7 | Usability | LOW | 已知限制：006 完成前結果頁一律「沒有組別送出」 | 006 完成後消失 |
| L8 | Process | LOW | T041、T043 可能需要改 001 的斷言（例如 `createServiceRegistry.test.ts` 檢查三個控制存在、`us4-student.spec.ts` 檢查訊息「模擬：驗證失敗」） | 實作時列出，由使用者決定 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-SUB-01～21 | ✅ | 見 tasks.md 需求追溯表 | 21 條全部有任務 |
| REQ-SUB-NFR-01～04 | ✅ | T027～T030、T012、T015 | 壓力測試、慢連線、時鐘 |
| SC-001～007 | ✅ | 見 tasks.md 成功標準表 | SC-006 為人工驗證 |
| AC-01～29 | ✅ | 每個 AC 至少出現在一個測試任務 | 以腳本逐一核對（2026-11-27） |

**Constitution Alignment Issues**: 沒有。I（三張圖完整、藍圖對照、T034）、II（追溯表）、III（只改組合根綁定與 `buildApp` 一行註冊，不改 001 頁面）、V（只讀 004 `ActivityStore`；單一佇列由 004 擁有）、VI（`forStudent` 的 `rank` 為 0、只送本組、`app.requireTeacher`、`TEACHER_ROOM`、T025）、VII（伺服器驗證、`{ code, message }`）、VIII（每個 Story 有正常與邊界測試、T033 人工驗證）、XI（不自建佇列與時鐘、不維護組別房間、不做 Outbox）。

**Unmapped Tasks**: T001–T003（Setup）、T033、T034（Polish），屬於基礎設施與驗證。

## Metrics

- Total Requirements: 25（21 條功能需求、4 條非功能需求）
- Total Acceptance Criteria: 29
- Total Tasks: 45（T001–T046，T036 未使用）
- Coverage: 100%
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0（第 5 次修正後：HIGH 0、MEDIUM 0、LOW 4）

## 跨子功能交界

| 交界 | 結果 |
| --- | --- |
| 001 `SubmissionService` 七個方法、`JudgeOutcome` | ✅ contracts/submission-api.md 第 4 節逐一對應；頁面行為照 001 最終版 |
| 001 D10–D18 | ✅ spec「001 交給 005 的事項」依最終版逐條處理 |
| 002 `buildApp`、`app.requireTeacher`、`app.io`、`TEACHER_ROOM`、`ApiClient`、`{ code, message }`、T043 老師路由清單 | ✅ T019、T022、T025 |
| 004 `CommandQueue`、`SequenceClock`、`ActivityStore.subscribe`、`GroupMembership.groupOf`、`ActivityManager.endQuestion`／`snapshot`、`RealtimeClient.on`／`emitWithAck`／`onConnect` | ✅ 已與 004 的實際程式核對（2026-11-27）：`snapshot` 可在 `run` 內呼叫；listener 參數為版本號；推送不在 `run` 內送出 |
| 006 `SubmissionStore.list`、`winner` | ✅ contracts/submission-store.md；`behindFirstMs` 由 006 計算 |

## Next Actions

- 第 5 次修正後沒有 CRITICAL、HIGH、MEDIUM；人工審查（原則 X）後可以進入 `/speckit-implement` Phase 1。
- 依 CLAUDE.md 第 3 節，spec 的修改要先獨立 commit（`spec` 類型），再 commit plan、tasks 等設計文件與圖表。
- 001 把 `Submission.rank` 改成可選後，執行 T035。
