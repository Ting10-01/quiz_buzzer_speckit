# Specification Analysis Report: 004 活動與階段同步

**Date**: 2026-11-21 | **Artifacts**: `spec.md`、`plan.md`、`tasks.md`（另參考 `research.md`、`data-model.md`、`contracts/`、`diagrams/004-*.puml`、constitution 1.0.0）

分析跑了四次。第 1 次找到的 CRITICAL 與 MEDIUM 已修正；第 2 次只剩 LOW。之後依主對話比對 002 交界的結果修改（第 3 次），再配合 001 最終版（PR #10）修改（第 4 次），重跑後都只有 LOW。

## 第 1 次分析（已修正）

| ID | Category | Severity | Location(s) | Summary | 處理 |
| --- | --- | --- | --- | --- | --- |
| C1 | Constitution（II） | CRITICAL | spec.md REQ-ACT-18、REQ-ACT-20 | 兩條需求沒有任何驗收準則，違反「每一條需求都必須能追溯到至少一條驗收準則」 | 新增 AC-30（時鐘往回調時結束時間不早於開放時間）、AC-31（只用長輪詢的連線連不上）；更新 checklist 對應、tasks 追溯表與 T019、T035 |
| D1 | Constitution（I） | MEDIUM | diagrams/004-class.png | 類別圖超過 PlantUML 4096 px 的上限，PNG 右側被裁掉（`ActivityGateway`、`ActivityManager`、`activityRoutes` 不完整） | 類別圖改為 `left to right direction`，重新產生 PNG（2818 × 2853），內容完整 |
| I1 | Inconsistency | MEDIUM | data-model.md `ActivityManager`；contracts/activity-http.md | 契約列出開放、結束在沒有活動時回 409 `NO_ACTIVITY`，data-model 的方法表沒有 | data-model 的 `openQuestion`、`endQuestion` 補上 `NO_ACTIVITY` |
| I2 | Inconsistency | MEDIUM | diagrams/004-component.puml；004-class.puml | 組件圖畫 `ActivityGateway → ActivityView`，類別圖與 data-model 是 gateway 經 `ActivityManager.snapshot(audience)` 取得快照；類別圖的 `ActivityBroadcaster` 沒有推送用的 Socket.IO 伺服器欄位 | 組件圖改為 `Gateway → Manager`（「加入、離開；連線時取 snapshot」）；類別圖與 data-model 的 `ActivityBroadcaster` 加上 `-io: Server` |
| A1 | Ambiguity | MEDIUM | contracts/activity-service.md | 「老師登入後何時以老師身分重新連線」寫法含糊，無法測試 | 改為具體規則：`RealtimeClient` 記住 `connectedTeacherToken`，與 002 的憑證不同時，`getCurrentActivity` 與老師指令先 `reconnect()`；類別圖與 data-model 補上該欄位；T049 測試 |
| U1 | Underspecification | MEDIUM | quickstart.md；tasks.md T053 | `npx playwright test -c frontend` 的 `-c` 需要設定檔路徑 | 改為 `-c frontend/playwright.config.ts` |

## 第 2 次分析（重跑）

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| L1 | Dependency | LOW | tasks.md「依賴 001 的修改」；T050 | （第 4 次更新）只剩 AC-26 需要 001 完成 C1（D21）；在那之前該 e2e 以 `test.skip` 標記，暫時限制（AC-32）現在就測 | 已在 PR #10 留言，001 實作時處理 |
| L2 | Coverage | LOW | spec.md Edge Cases「複製分頁」 | 沒有專門的自動化測試 | 行為由 `GroupMembership` 的「同一 token 不重複計算」（T011）涵蓋，不另加測試 |
| L3 | Organization | LOW | tasks.md T043 | logging 是跨 Story 的工作，放在 US3 | 放在 US3 是因為 US3 完成時所有事件都已存在；不影響執行順序 |
| L4 | Organization | LOW | tasks.md T028 | 一個任務同時包含實作與 e2e 情境 | 兩者都很小且同屬 US1；可在實作時拆開 |
| L5 | UX | LOW | contracts/activity-service.md `onPhaseChange` | 選組頁只訂閱 `onPhaseChange`，其他學生加入時選組頁上的各組人數不會即時更新 | 001 只要求 T-Lobby 即時更新人數（「階段推動的切換」T-Lobby 列）；不處理 |
| L6 | Constitution（III） | LOW | tasks.md T018、T042、T043 | 004 會修改 002 的 `buildApp`（`server/src/app.ts`，以 `app.register` 註冊模組）、`server/src/logger.ts`（`redact.paths` 加 `*.studentToken`），以及 001 的 `createServiceRegistry.ts`（換綁定、暫時橋接） | 都是 002 `contracts/server-extension.md` 與 001 plan 明確開放的擴充點；頁面不改，對 001 頁面的修改走 spec「需請 001 修改」 |

## 第 3 次分析（依 002 交界修正後重跑）

修正內容（以 002 `contracts/server-extension.md`、`socket-handshake.md` 為準）：

- Socket.IO 伺服器改用 002 的 `app.io`（已設 `transports: ['websocket']`），004 不再自建；老師連線由 002 的 handshake 驗證放進 `TEACHER_ROOM`、設 `socket.data.isTeacher`，004 只把其他連線加入 `students` 房間；暫稱 `teacherSocketAuth` 已拿掉。
- 002 換發老師憑證時以 `disconnectSockets(true)` 中斷舊老師連線、作廢憑證的 handshake 被拒（`UNAUTHORIZED`）：`RealtimeClient` 在 `io server disconnect` 時自動重連，被拒且憑證沒換時記下 `rejectedTeacherToken` 改以一般連線重連（research RA-07、T020、T048、T049）。
- 前端老師指令改經 002 的 `ApiClient`，老師憑證由 `TeacherCredentialStore.get()` 放進 `auth.teacherToken`；`TeacherApi` 已拿掉。
- 錯誤回應改為 002 的 `ErrorBody { code, message }`；因 `ApiClient` 遇到非 2xx 只保留 `{ status, code, message }`，`ValidationError` 改以 `200` 回傳、前端以 `isValidationError` 區分（原本的 `422` 全部拿掉）；非 2xx 只用於 409 規則錯誤與 401。
- 模組在 002 的 `buildApp(config, deps)` 以 `app.register` 註冊；老師路由 `{ preHandler: app.requireTeacher }` 並加進 002 T043 的「老師專用路由清單」；`*.studentToken` 加到 002 `logger.ts` 的 `redact.paths`。
- `contracts/server-modules.md` 補上前端 `RealtimeClient` 給 005、006 的方法：`on<T>(event, listener)`、`emitWithAck<T>(event, payload)`、`onConnect(listener)`（原本的 `onSnapshot` 併入 `on`）。

重跑結果：

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| L7 | UX | LOW | research RA-07 | 老師在另一個分頁重新登入後，舊老師分頁的連線退回一般連線，只收學生版快照；畫面不會主動提示，要等按下老師按鈕才看到「老師登入已失效，請回首頁重新登入」 | 002 定義的行為（同一時間只有一個有效老師憑證）；不另加提示 |

檢查項目：所有檔案中已沒有 `TeacherApi`、`teacherSocketAuth`、`new Server`、`422`、`onSnapshot`；`data-model.md` 與 `diagrams/004-class.puml`（`ApiClient`、`ApiError`、`TeacherCredentialStore`、`app.io`、`RealtimeClient` 的 `on`、`rejectedTeacherToken`）一致；需求、AC、任務數不變，追溯表不變。

**Constitution Alignment Issues:** 無（第 1 次的 C1、D1 已修正）。

**Unmapped Tasks:** 無。Setup 與 Foundational 的任務（T001–T022）對應到 REQ-ACT-12、14、15、17、18、19、20（見 tasks 追溯表）；T051–T053 對應原則 I、VIII。

## 第 4 次分析（配合 001 最終版）

依 `specs/001-ui-prototype/`（PR #10）與 `docs/feature-split.md` 最新版，以及使用者 2026-11-22 的決定，比對 spec、plan、research、data-model、contracts、quickstart、tasks 與三張圖。

比對時發現、並已在本輪修正的不一致：

| ID | Category | 原本的嚴重度 | Location(s) | 不一致 | 處理 |
| --- | --- | --- | --- | --- | --- |
| X1 | Inconsistency（與 001） | HIGH | spec「需請 001 修改」C2；data-model；contracts/activity-service.md；class 圖 | 004 假設 `joinGroup` 回傳 `Promise<Activity \| ValidationError>`，001 最終版仍是 `Promise<Activity>` | 改為以 `UnexpectedError(message)` reject，顯示在共通錯誤訊息區；`GroupAck.error` 改為 `{ code, message }`（`NO_ACTIVITY`、`NO_SUCH_GROUP`、`GROUP_LOCKED`）；AC-12、REQ-ACT-11、T031、T034、T044 同步；C2 刪除 |
| X2 | Inconsistency（與 001） | MEDIUM | spec C5；tasks T044 | 結束最後一題直接 `FINISHED`、S-Join 依階段切換，001 最終版已完成，004 仍列為請 001 修改 | C5 刪除；AC-13、AC-14 改為依 001 RD-14（`OPEN` 時頁面再呼叫 005 的 `getGroupSubmission`）；時序圖第 5 段同步 |
| X3 | Inconsistency（與 001） | MEDIUM | spec C3、C4；data-model `activityRules` | 組數範圍、預設值與說明文字，001 spec 已明文交給 004 定義，不需要請 001 修改 | C3、C4 刪除，改為「001 實作時照 004 的規則」；REQ-ACT-02、「說明文字」一節、Clarifications 同步 |
| X4 | Inconsistency（與使用者決定） | HIGH | spec REQ-ACT-21、US4、SC-005；tasks T050 | D21 的 001 修改尚未完成，004 的 AC-26 現在無法成立，也沒有寫明修改前的行為 | 改為暫時限制：活動繼續；老師重新登入後進入 T-Pick；再建立活動回 `ACTIVITY_EXISTS`「已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器」（新增 AC-32）；AC-26 標明「001 完成 C1 後」；時序圖第 6 段分成兩個 alt |
| X5 | Inconsistency（與 001、002） | MEDIUM | spec Assumptions、REQ-ACT-09；research RA-07；contracts/socket-events.md | 老師規則仍寫「同一個帳號重新登入」；001 最終版與 002 為「以 Google 登入的人就是老師，任何人登入都取代前一位老師」 | 全部改寫；被取代的老師分頁退回一般連線（RA-07 原本的機制已涵蓋） |
| X6 | Inconsistency（與 001） | MEDIUM | research RA-09、RA-07；contracts/activity-service.md | 001 最終版的 T-Lobby 不呼叫 `getCurrentActivity`，004 原本以「登入後第一個呼叫是 `getCurrentActivity`」保證老師版快照 | 改為：老師登入後第一個活動指令是 `createActivity`，執行前已依憑證重新連線；`getCurrentActivity` 的呼叫者只寫 Main、S-Join |
| X7 | Coverage（模擬橋接） | MEDIUM | research RA-14；tasks T042 | 001 最終版的模擬 `judge(ACCEPTED)` 只結束模擬的題目，接上 004 後伺服器題目仍開著，老師無法開放下一題 | 組合根包一層 `judge`：結果不是 `OPEN` 時呼叫真正的 `endQuestion(q)`，以其回傳的活動取代 `JudgeOutcome.activity` |

重跑結果（第 4 次）：

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| L8 | Dependency | LOW | spec REQ-ACT-02、AC-01、AC-02；tasks T028 | 組數預設 6 與「−」「+」不可用由 001 實作 T-Setup 時照 004 的常數完成；001 spec 已交給 004，但 001 tasks T064 沒有寫出要引用 `activityRules` | 不改 001；004 的 e2e（T028）會在 001 實作後驗證，結果不符時回報 001 |
| L9 | UX | LOW | spec REQ-ACT-21、AC-32 | D21 暫時限制期間，老師重新整理後沒有人能控制這場活動，只能重新啟動伺服器 | 使用者 2026-11-22 已接受為暫時限制；001 完成 C1 後解除 |

其餘 L2–L7 不變。檢查項目：所有檔案中已沒有「需請 001 修改」C2–C5、`Promise<Activity | ValidationError>` 形式的 `joinGroup`、「同一個帳號重新登入」的老師規則、T-Lobby 呼叫 `getCurrentActivity` 的描述；`data-model.md` 與 `diagrams/004-class.puml`（`joinGroup` 簽章、`GroupAck.error`）一致；三張 PNG 已重新產生且未被截掉（最大寬度 3017 px）。

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --- | --- | --- | --- |
| REQ-ACT-01 | Yes | T023、T024、T026、T027 | |
| REQ-ACT-02 | Yes | T002、T023、T024、T026、T028 | 頁面部分由 001 實作時照 004 的常數（L8） |
| REQ-ACT-03 | Yes | T023、T026 | |
| REQ-ACT-04 | Yes | T023、T026 | |
| REQ-ACT-05 | Yes | T035–T037、T039、T040 | |
| REQ-ACT-06 | Yes | T035、T036、T039、T044 | 學生頁面切換 001 最終版已完成 |
| REQ-ACT-07 | Yes | T035、T039 | |
| REQ-ACT-08 | Yes | T005、T006、T018、T035、T039 | |
| REQ-ACT-09 | Yes | T024、T027、T037、T040 | |
| REQ-ACT-10 | Yes | T011、T012、T029、T030、T032、T033 | |
| REQ-ACT-11 | Yes | T029–T034 | 被拒絕以 `UnexpectedError` 顯示（第 4 次 X1） |
| REQ-ACT-12 | Yes | T011、T012、T017、T018、T030 | |
| REQ-ACT-13 | Yes | T011、T012、T020、T030、T034、T044 | |
| REQ-ACT-14 | Yes | T009、T010、T016、T019、T021、T022、T038 | |
| REQ-ACT-15 | Yes | T017、T019、T036 | |
| REQ-ACT-16 | Yes | T016、T022、T036、T044 | |
| REQ-ACT-17 | Yes | T005、T006、T026、T032、T035、T039、T045 | |
| REQ-ACT-18 | Yes | T007、T008、T035、T039 | AC-30 |
| REQ-ACT-19 | Yes | T013、T014、T016、T017、T030、T044 | |
| REQ-ACT-20 | Yes | T018、T019、T020、T044 | AC-31 |
| REQ-ACT-21 | Yes | T023、T048–T050 | AC-32（暫時限制）現在測；AC-26 依賴 001 C1 |
| REQ-ACT-NFR-01 | Yes | T016、T045–T047 | |
| REQ-ACT-NFR-02 | Yes | T032、T045–T047 | |
| SC-001～SC-006 | Yes | T024、T030、T037、T044–T047、T050、T051 | |

## Metrics

- Total Requirements：23（REQ-ACT-01～21、NFR-01～02）；Acceptance Criteria：32（AC-01～32）；Success Criteria：6
- Total Tasks：53
- Coverage：100%（23 / 23 條需求至少有一個任務與一個測試任務）
- Ambiguity Count：0（第 1 次 1 個，已修正）
- Duplication Count：0
- Critical Issues Count：0（第 1 次 1 個，已修正）
- 各嚴重度（第 4 次）：CRITICAL 0、HIGH 0、MEDIUM 0、LOW 9（L1–L9）

## Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM，可以在人工審查（原則 X）後進入 `/speckit-implement`。
- 「需請 001 修改」只剩 C1（D21），已在 PR #10 留言；在那之前 AC-26 的 e2e 先 skip，其餘都可以實作與測試（L1）。
