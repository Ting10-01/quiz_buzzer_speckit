# Specification Analysis Report: 005 搶答與判定

**Date**: 2026-11-21 | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、tasks.md、research.md、data-model.md、contracts/、diagrams/005-*.puml、constitution.md；交界對照 004 `contracts/server-modules.md`、`socket-events.md`，002 `contracts/server-extension.md`、`socket-handshake.md`

## 第 1 次分析的發現（已修正）

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| C1 | Constitution | CRITICAL | spec.md 原 User Story 5；tasks.md 原 Phase 7 | 原則 VIII 要求每個 User Story 有正常與邊界案例的自動化測試；原 US5（說明文字）只有一個文字檢查 | AC-26 併入 US2，檢查任務移到 Polish；不再有 US5 |
| U1 | Inconsistency | MEDIUM | tasks.md | Foundational 的組裝要通知 `SubmissionNotifier`，但 Notifier 原本排在 US2 才實作 | Notifier 的測試與實作移到 Foundational |
| F1 | Inconsistency | MEDIUM | diagrams/005-class.puml；data-model.md | 類別圖缺 `SubmissionEngine → SubmissionVisibility` | 補上關聯，重新產生 PNG |
| T1 | Traceability | MEDIUM | spec.md REQ-SUB-NFR-04 | 沒有標出 `docs/assignment.md` 編號 | 改為「R10、高併發」 |
| F2 | Inconsistency | LOW | plan.md Scale/Scope | 類別數與類別圖不符 | 已改 |

## 第 2 次分析：對齊 002、004 的契約（主對話 2026-11-21 交界比對）

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| X1 | Inconsistency | HIGH | spec、plan、research RD-01／RD-02、data-model、類別圖、組件圖、時序圖、tasks 原 T004–T007 | 005 自建 `CommandQueue`、`SequenceClock`，但 004 已擁有這兩者，且 004 的開放、結束一題走同一條佇列（004 REQ-ACT-17）；兩條佇列會破壞單一順序 | 改用 004 的 `CommandQueue.run(command)` 與 `SequenceClock.stamp()`；刪除建立這兩個類別的 4 個任務（任務重新編號）；開放時間改讀 004 `ActivityState.openedAt`，`SubmissionStore` 不再記開放時間；處理序號改由 `SubmissionEngine.processed` 記錄；三張圖與 PNG 重新產生 |
| X2 | Inconsistency | MEDIUM | 全部文件與圖 | 004 名稱不同：`ActivityCommands.endQuestion` → `ActivityManager.endQuestion`；`ActivityStore.onChange` → `ActivityStore.subscribe`（listener 在 `commit` 當下、仍在 `run` 內）；前端共用連線是 `RealtimeClient` | 全部改名；research RD-07 註明呼叫 `endQuestion` 前已確認題目開放中，不會碰到 `ActivityRuleError(QUESTION_NOT_OPEN)` |
| X3 | Inconsistency | MEDIUM | contracts/submission-api.md、research RD-03／RD-05、data-model、tasks | 004 不建立 `group:<n>` 房間；002 的老師房間是 `TEACHER_ROOM`、Socket.IO 伺服器是 `app.io`、錯誤格式是 `{ code, message }`、路由以 `app.register` 註冊並掛 `app.requireTeacher`、前端 HTTP 是 `ApiClient.request` | 判定通知改為掃描 `app.io` 連線、送給 `groupOf(socket) === n` 者（research RD-05，寫明上限）；老師推播只送 `io.to(TEACHER_ROOM)`；400 回應加 `code`；路由註冊方式、002 T043 老師路由清單測試寫進 contracts、plan A-5、tasks T022 |
| L1 | Underspecification | ~~LOW~~ 已修正 | data-model.md | 原本自訂的逾時訊息只寫在 data-model | 改用 004 `RealtimeClient.emitWithAck` 的「連不上伺服器」，不另訂訊息 |

## 第 3 次分析（修正後重跑）

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| L2 | Coverage | LOW | spec.md SC-006 | 「不超過 2 個操作步驟」只有人工驗證（T033） | 屬於使用體驗指標，人工驗證即可 |
| L3 | Dependency | LOW | plan.md 交界假設 A-3 | 004 契約說 005 在 `RealtimeClient` 上新增事件，但 004 data-model 只列 `onSnapshot`、`onConnect`；005 假設有一般的 `on(event, listener)` | 請 004 在 `RealtimeClient` 補上一般事件訂閱，或指定 005 的做法 |
| L4 | Dependency | LOW | plan.md A-6、A-8；research RD-06 | 實作前需要 001 把 `Submission.rank` 改為可選；測試需要 002 的老師憑證測試替身 | 已列在 spec「需請 001 修改」與 plan 交界假設 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-SUB-01～19 | ✅ | 見 tasks.md 需求追溯表 | 19 條全部有任務 |
| REQ-SUB-NFR-01 | ✅ | T027、T028、T029 | 壓力測試 |
| REQ-SUB-NFR-02 | ✅ | T027、T030 | |
| REQ-SUB-NFR-03 | ✅ | T012、T015 | 改以 `SubmissionEngine` 測試驗證（時鐘本身的測試屬於 004） |
| REQ-SUB-NFR-04 | ✅ | T027、T030 | 慢連線 |
| SC-001～007 | ✅ | 見 tasks.md 成功標準表 | SC-006 為人工驗證 |
| AC-01～26 | ✅ | 每個 AC 至少出現在一個測試任務 | 以腳本逐一核對 |

**Constitution Alignment Issues**: 沒有。I（藍圖對照、T034）、II（追溯表）、III（只改組合根綁定與 `buildApp` 一行註冊）、V（只讀 004 `ActivityStore`；單一佇列由 004 擁有）、VI（`forStudent`、`app.requireTeacher`、`TEACHER_ROOM`、T025）、VII（伺服器驗證、`{ code, message }`）、VIII（每個 Story 有正常與邊界測試、T033 人工驗證）、XI（不自建佇列與時鐘、不維護組別房間、不做 Outbox）。

**Unmapped Tasks**: T001–T003（Setup）、T033、T034（Polish），屬於基礎設施與驗證。

## Metrics

- Total Requirements: 23（19 條功能需求、4 條非功能需求）
- Total Acceptance Criteria: 26
- Total Tasks: 34
- Coverage: 100%
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0（HIGH 0、MEDIUM 0、LOW 3）

## 跨子功能交界

| 交界 | 結果 |
| --- | --- |
| 001 `SubmissionService` 五個方法 | ✅ contracts/submission-api.md 第 4 節逐一對應；頁面要改的地方列在 spec「需請 001 修改」 |
| 001 D10–D18 | ✅ spec「001 交給 005 的事項」逐條決定 |
| 002 `buildApp`、`app.requireTeacher`、`app.io`、`TEACHER_ROOM`、`ApiClient`、`{ code, message }` | ✅ 與 002 contracts/server-extension.md、socket-handshake.md 一致；T019、T022、T025 |
| 004 `CommandQueue`、`SequenceClock`、`ActivityStore.subscribe`、`GroupMembership.groupOf`、`ActivityManager.endQuestion`、`RealtimeClient` | ✅ 與 004 contracts/server-modules.md、socket-events.md 一致；`RealtimeClient.on` 待 004 確認（L3） |
| 006 `SubmissionStore` | ✅ contracts/submission-store.md；T004、T005 |

## Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM，可以進入人工審查（原則 X）。
- 開始 `/speckit-implement` 前：001 完成「需請 001 修改」第 5 項；004 確認 `RealtimeClient` 的一般事件訂閱（A-3）。
