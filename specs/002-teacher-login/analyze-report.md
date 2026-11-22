# Specification Analysis Report: 002 老師登入

**Date**: 2026-11-21 | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、tasks.md、research.md、data-model.md、contracts/、diagrams/002-*.puml、constitution.md

## 第一次分析的發現（已修正）

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| C1 | Underspecification | ~~MEDIUM~~ 已修正 | tasks.md T050；plan.md Project Structure | T050 的 `server/tests/unit/GoogleAuthLibraryGateway.test.ts` 不在 plan 的檔案樹中 | plan 的 `server/tests/unit/` 加入該檔 |
| F1 | Inconsistency | ~~MEDIUM~~ 已修正 | research.md RD-10；tasks.md T017 | research 規定只有 `401 UNAUTHORIZED` 才清除老師憑證，但 T017 沒有測 `401 GOOGLE_AUTH_EXPIRED` 不清除；實作若對所有 401 清除，老師會因 Google 授權失效而被登出 | T017 加入「`401 GOOGLE_AUTH_EXPIRED` 保留憑證、使用伺服器訊息」的案例 |
| F2 | Inconsistency | ~~MEDIUM~~ 已修正 | spec.md AC-13；contracts/socket-handshake.md | AC-13 寫拒絕原因為「需要老師登入」，契約的 handshake 錯誤是 `UNAUTHORIZED`（連線沒有顯示文字的地方） | AC-13 改為「拒絕原因與 AC-10 相同：沒有通過老師檢查」 |
| U1 | Underspecification | ~~MEDIUM~~ 已修正 | tasks.md T043 | 以 `app.printRoutes()` 檢查路由是否掛 `requireTeacher` 做不到（輸出不含 preHandler），SC-002 的驗證方式不可行 | 改為維護「老師專用路由清單」，逐一以無憑證、作廢憑證驗證回 401；003–006 新增路由時擴充 |

## 重跑結果（修正後）

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| L1 | Underspecification | LOW | data-model.md `GoogleTokens` | Google 沒有回傳 refresh token 時視為 `GoogleUnavailableError`，老師會看到「連不上 Google」，原因描述不精確。因每次登入都 `prompt=consent`，正常不會發生 | 實作時若觀察到，改回 `INVALID_CODE`「Google 登入未完成，請再試一次」 |
| L2 | Coverage | LOW | spec.md SC-001、SC-006 | 只能人工驗證（真正的 Google 同意畫面），由 T055 涵蓋；SC-006 另有 T036 自動化 | 無需修改 |
| L3 | Dependency | LOW | tasks.md T023 | `SCOPE_DENIED` 依 001 的修改；001 未合併前 T021、T022 的對應案例暫停 | 追蹤「需請 001 修改」第 1 條；001 若不同意，先改 002 spec 再改 tasks |
| L4 | Duplication | LOW | tasks.md T038、T031 | T038 只是確認 T031 的同分頁換發行為 | 可併入 T031，不影響執行順序 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-AUTH-01 | ✅ | T021、T022、T029–T032 | |
| REQ-AUTH-02 | ✅ | T019、T020、T026、T033 | SC-005 重複 100 次在 T019 |
| REQ-AUTH-03 | ✅ | T034–T038、T040、T042 | |
| REQ-AUTH-04 | ✅ | T021、T022、T030 | |
| REQ-AUTH-05 | ✅ | T019、T020、T023、T024、T026、T030 | T023 依 001 修改 |
| REQ-AUTH-06 | ✅ | T015–T018、T039、T041 | |
| REQ-AUTH-07 | ✅ | T027、T039、T043 | |
| REQ-AUTH-08 | ✅ | T040、T042 | |
| REQ-AUTH-09 | ✅ | T025、T044、T046 | |
| REQ-AUTH-10 | ✅ | T045、T047 | |
| REQ-AUTH-11 | ✅ | T020、T021、T028、T031、T036 | |
| REQ-AUTH-12 | ✅ | T002、T003、T005–T007、T048、T056 | |
| REQ-AUTH-13 | ✅ | T005、T008、T013、T017、T049–T053 | |
| SC-001～SC-007 | ✅ | 見 tasks.md 追溯表 | |

AC-01～AC-25 每一條都出現在至少一個任務中。

**Constitution Alignment Issues**: 無。
- I：plan「藍圖對照」對應三張圖的每個組件與類別；T057 圖表一致性驗證。規劃時的補充（G-1、G-2）已先更新類別圖並重新產生 PNG。
- II：13 條 REQ 都有 AC、任務與測試；規劃時新增的訊息已先寫入 spec。
- III：前端只改 `createServiceRegistry()` 的 `auth` 綁定；伺服器 003–006 只在 `buildApp` 註冊路由。
- V：老師身分只由伺服器 `TeacherAuth` 決定。
- VI：伺服器端檢查（T039、T040）、`sessionStorage`（T015、T041）、log 遮蔽（T048）、repo 掃描（T056）。
- VII：每種錯誤都有指定訊息（spec 表、contracts、T049–T053）。
- VIII：五個 Story 都有正常與邊界案例；Google 以 `GoogleOAuthGateway`、`GoogleIdentityClient` 的替身取代；T055 人工驗證。
- XI：兩個只有一個實作的介面以原則 VIII 為理由，寫在 plan Constitution Check。

**Unmapped Tasks**: T001、T004、T009–T012、T014（基礎設施）、T054、T057（Polish），不需對應單一需求。

## Metrics

- Total Requirements: 13（REQ-AUTH-01～13）＋ 7 條 Success Criteria
- Total Acceptance Criteria: 25（AC-01～AC-25）
- Total Tasks: 57
- Coverage: 100%（13/13 需求、25/25 AC 有任務）
- Ambiguity Count: 0
- Duplication Count: 1（LOW，L4）
- Critical Issues Count: 0（CRITICAL 0、HIGH 0、MEDIUM 0、LOW 4）

## 跨子功能交界

| 交界 | 結果 |
| --- | --- |
| 共用說明「跨子功能交界」表中 002 提供的項目 | ✅ 伺服器骨架（T001–T014）、pino（T007）、設定（T005、T006）、`requireTeacher`（T027）、handshake `auth.teacherToken`（T042）、`GoogleClientProvider.authorizedClient()`（T025）、`GET /api/auth/picker-token`（T047），名稱與表一致 |
| 001 `AuthService` 契約 | ✅ `signInWithGoogle`、`getCurrentAccount` 簽章不變；回傳值與 reject 規則見 contracts/auth-http.md |
| 001 D1 | ✅ 沿用兩種失敗、新增 `SCOPE_DENIED`（需請 001 修改第 1 條） |
| 001 D21 | ✅ 002 部分（同帳號重新登入、舊憑證作廢、活動不變）由 REQ-AUTH-03 與 T034–T037 涵蓋；頁面切換列入需請 001 修改第 2 條 |
| 001 D22（004 決定） | ✅ 002 建立 Socket.IO 時套用 `transports: ['websocket']`（T040、T042） |

## Next Actions（第二次分析時，已由第三次分析取代）

- 沒有 CRITICAL、HIGH、MEDIUM；可在人工審查後進入 `/speckit-implement`，但 001 必須先合併。
- 「需請 001 修改」三條需 TingYi 確認；第 1 條影響 T023。

## 第三次分析（配合 001 最終版，2026-11-22）

依 001 最終版（PR #10）、feature-split 最新版與使用者 2026-11-22 的決定修改後重跑。001 的差異以 commit `fd2b5eb` 與目前分支比對 `specs/001-ui-prototype`、`diagrams/001-*`、`docs/feature-split.md` 確認：`SignInFailure` 只剩 `CANCELLED`；001 data-model 寫明「其他失敗種類由 002 新增」；FR-013「以 Google 登入的人即為老師」；D1 修訂；T-Login 新增「返回首頁」（不呼叫介面，與 002 無關）。

### 修改前發現的不一致（已修正）

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| A1 | Inconsistency | ~~CRITICAL~~ 已修正 | spec REQ-AUTH-02、AC-02、AC-05、AC-06、SC-005；research RD-02；data-model 3、4；contracts/auth-http.md；類別圖、時序圖；tasks T019–T022、T026、T048 | 002 定義「第一個登入的帳號才是老師」與 `NOT_TEACHER`，與 001 FR-013、001 data-model（`SignInFailure` 只有 `CANCELLED`）、feature-split 002「以 Google 登入的人即為老師」衝突 | 改為「以 Google 登入的人即為老師，任何登入取代前一個老師」；刪除 AC-02、AC-05、AC-06（編號不重複使用），新增 AC-26、AC-27；SC-005 改為「恰好一組有效憑證、授權屬於同一帳號」；移除 `TeacherBinding.googleSub`、`GoogleSignIn.sub` |
| A2 | Inconsistency | ~~HIGH~~ 已修正 | spec「需請 001 修改」；data-model 1；plan；tasks T023 | `SCOPE_DENIED` 列為請 001 修改，T023 等 001 合併；001 data-model 已寫明由 002 新增，使用者決定不再請 001 改 | 改為 002 新增（T023 不再等待），T023 同時在 T-Login 的失敗訊息對照加上文字（001 FR-013 授權 002 定義訊息文字） |
| A3 | Inconsistency | ~~MEDIUM~~ 已修正 | contracts/auth-http.md；research RD-10；時序圖 | `SCOPE_DENIED` 以 403 回傳，與跨子功能「預期中的失敗用 200 回傳」的慣例不一致 | 改為 200 `{ ok: false, failure: 'SCOPE_DENIED' }`；成功回應加上 `ok: true` |
| A4 | Inconsistency | ~~MEDIUM~~ 已修正 | spec D21、AC-07、SC-006、Edge Cases | D21 寫成「重新登入後回到控制台」，但 001 現況登入後一律進 T-Pick，且使用者決定先不改 001 | 寫明暫時限制：伺服器保留活動，重新登入後進 T-Pick；頁面切換的修改留在「需請 001 修改」（已在 PR #10 留言） |
| A5 | Inconsistency | ~~MEDIUM~~ 已修正 | spec「需請 001 修改」原第 3 條 | 請 001 讓 T-Login 不顯示「模擬：非預期錯誤」，使用者決定不再請 001 改 | 移到 Assumptions，列為已知限制 |
| A6 | Inconsistency | ~~MEDIUM~~ 已修正 | data-model `buildApp`；contracts/server-extension.md | `deps` 寫成只有 `{ gateway }`，003 已使用 `deps.spreadsheetReader` | 改為「`deps.gateway` 是 002 的注入點，003–006 可加入自己的替身」 |
| A7 | Underspecification | ~~MEDIUM~~ 已修正 | spec Edge Cases；contracts/server-extension.md | 換帳號登入後 Google 授權換成新帳號，003、006 若保存舊的 client 會用錯帳號；新帳號可能沒有已匯入學習單的權限 | server-extension 規定每次呼叫 Google 前重新 `authorizedClient()`；Edge Cases 寫明新帳號沒有權限時由 003、006 說明 |

### 重跑結果

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| L1 | Underspecification | LOW | data-model.md `GoogleTokens` | 同第二次分析 L1 | 不變 |
| L2 | Coverage | LOW | spec.md SC-001、SC-006 | 只能人工驗證的部分由 T055 涵蓋 | 不變 |
| L4 | Duplication | LOW | tasks.md T038、T031 | 同第二次分析 L4 | 不變 |
| L5 | Constitution（III） | LOW | tasks.md T023 | T023 在 001 的 `TeacherLoginPage.tsx` 失敗訊息對照加一筆文字，屬於修改既有實作。001 FR-013 明定失敗種類與訊息文字由 002 定義、001 data-model 明定由 002 新增失敗種類，是 001 預留的擴充點（與改 `createServiceRegistry()` 的綁定同性質），不改欄位、按鈕或頁面切換 | 不需修改；implement 時在 PR 註明 |

第二次分析的 L3（T023 等 001 修改）已不存在（A2）。

### Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-AUTH-01 | ✅ | T021–T023、T029–T032 | |
| REQ-AUTH-02 | ✅ | T019、T020、T026、T033、T034 | 以 Google 登入的人即為老師 |
| REQ-AUTH-03 | ✅ | T034–T038、T040、T042 | 任何登入取代前一個老師；SC-005 重複 100 次在 T034 |
| REQ-AUTH-04 | ✅ | T021、T022、T030 | |
| REQ-AUTH-05 | ✅ | T019、T020、T023、T024、T026、T030 | `SCOPE_DENIED` 由 002 新增 |
| REQ-AUTH-06～13 | ✅ | 同第二次分析 | 沒有變動 |
| SC-001～SC-007 | ✅ | 見 tasks.md 追溯表 | |

AC-01、AC-03、AC-04、AC-07～AC-27 每一條都出現在至少一個任務中（AC-02、AC-05、AC-06 已刪除）。

**Constitution Alignment Issues**: 無（L5 已說明為 001 預留的擴充點）。原則 V：老師憑證與 Google 授權在同一段同步程式中換發，不會分屬兩個帳號。

### Metrics

- Total Requirements: 13（REQ-AUTH-01～13）＋ 7 條 Success Criteria
- Total Acceptance Criteria: 24（AC-01、AC-03、AC-04、AC-07～AC-27）
- Total Tasks: 57（編號不變）
- Coverage: 100%（13/13 需求、24/24 AC 有任務）
- Critical Issues Count: 0（CRITICAL 0、HIGH 0、MEDIUM 0、LOW 4）

### 跨子功能交界（第三次）

| 交界 | 結果 |
| --- | --- |
| `ApiClient`、`ErrorBody { code, message }`、`app.io`、`TEACHER_ROOM`、`buildApp`、`requireTeacher`、`app.googleClients`、`isGoogleAuthExpired`、`GET /api/auth/picker-token` | ✅ 名稱不變 |
| 預期中的失敗用 200 回傳 | ✅ `SCOPE_DENIED` 改為 200（A3） |
| 003 `deps.spreadsheetReader` | ✅ data-model、server-extension 已註明 `deps` 可擴充（A6） |
| 任何登入取代前一個老師 → Google 授權換成新帳號 | ⚠️ 003、006 必須每次重新 `authorizedClient()`；新帳號沒有已匯入學習單的權限時由 003、006 回報（A7）。已寫進 server-extension，需 003、006 確認 |
| 001 D21 | ✅ 暫時限制寫進 spec；頁面切換留在「需請 001 修改」 |

### Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM；人工審查後可進入 `/speckit-implement`（等 001 實作完成）。
- 「需請 001 修改」只剩 D21 的頁面切換，已在 PR #10 留言。
