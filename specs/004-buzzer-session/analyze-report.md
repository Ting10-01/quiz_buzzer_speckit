# Specification Analysis Report: 004 活動與階段同步

**Date**: 2026-11-21 | **Artifacts**: `spec.md`、`plan.md`、`tasks.md`（另參考 `research.md`、`data-model.md`、`contracts/`、`diagrams/004-*.puml`、constitution 1.0.0）

分析跑了三次。第 1 次找到的 CRITICAL 與 MEDIUM 已修正；第 2 次只剩 LOW。之後依主對話比對 002 交界的結果修改（見「第 3 次」），重跑後仍只有 LOW。

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
| L1 | Dependency | LOW | tasks.md「依賴 001 的修改」；T028、T031、T034、T044、T050 | AC-01、AC-02、AC-12 的頁面呈現、AC-20 的學生頁面、AC-26、AC-27 需要 001 先完成 C1–C5；在那之前這些 e2e 以 `test.skip` 標記 | 已在 tasks 列出對應；請 001 負責人排入。伺服器與服務層的測試不受影響 |
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

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --- | --- | --- | --- |
| REQ-ACT-01 | Yes | T023、T024、T026、T027 | |
| REQ-ACT-02 | Yes | T002、T023、T024、T026、T028 | 頁面部分依賴 001 C3 |
| REQ-ACT-03 | Yes | T023、T026 | |
| REQ-ACT-04 | Yes | T023、T026 | |
| REQ-ACT-05 | Yes | T035–T037、T039、T040 | |
| REQ-ACT-06 | Yes | T035、T036、T039、T044 | 學生頁面依賴 001 C5 |
| REQ-ACT-07 | Yes | T035、T039 | |
| REQ-ACT-08 | Yes | T005、T006、T018、T035、T039 | |
| REQ-ACT-09 | Yes | T024、T027、T037、T040 | |
| REQ-ACT-10 | Yes | T011、T012、T029、T030、T032、T033 | |
| REQ-ACT-11 | Yes | T029–T034 | `ValidationError` 依賴 001 C2 |
| REQ-ACT-12 | Yes | T011、T012、T017、T018、T030 | |
| REQ-ACT-13 | Yes | T011、T012、T020、T030、T034、T044 | |
| REQ-ACT-14 | Yes | T009、T010、T016、T019、T021、T022、T038 | |
| REQ-ACT-15 | Yes | T017、T019、T036 | |
| REQ-ACT-16 | Yes | T016、T022、T036、T044 | |
| REQ-ACT-17 | Yes | T005、T006、T026、T032、T035、T039、T045 | |
| REQ-ACT-18 | Yes | T007、T008、T035、T039 | AC-30 |
| REQ-ACT-19 | Yes | T013、T014、T016、T017、T030、T044 | |
| REQ-ACT-20 | Yes | T018、T019、T020、T044 | AC-31 |
| REQ-ACT-21 | Yes | T048–T050 | 頁面依賴 001 C1 |
| REQ-ACT-NFR-01 | Yes | T016、T045–T047 | |
| REQ-ACT-NFR-02 | Yes | T032、T045–T047 | |
| SC-001～SC-006 | Yes | T024、T030、T037、T044–T047、T050、T051 | |

## Metrics

- Total Requirements：23（REQ-ACT-01～21、NFR-01～02）；Acceptance Criteria：31（AC-01～31）；Success Criteria：6
- Total Tasks：53
- Coverage：100%（23 / 23 條需求至少有一個任務與一個測試任務）
- Ambiguity Count：0（第 1 次 1 個，已修正）
- Duplication Count：0
- Critical Issues Count：0（第 1 次 1 個，已修正）
- 各嚴重度（第 3 次）：CRITICAL 0、HIGH 0、MEDIUM 0、LOW 7（L1–L7）

## Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM，可以在人工審查（原則 X）後進入 `/speckit-implement`。
- 實作前請 001 負責人處理 spec「需請 001 修改」C1–C5；在那之前 US1–US3 的伺服器與服務層可先實作，受影響的 e2e 先 skip（L1）。
