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

## Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM；可在人工審查後進入 `/speckit-implement`，但 001 必須先合併。
- 「需請 001 修改」三條需 TingYi 確認；第 1 條影響 T023。
