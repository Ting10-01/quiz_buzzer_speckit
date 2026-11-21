# Specification Analysis Report: 003 匯入學習單

**Date**: 2026-11-21 | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、tasks.md、research.md、data-model.md、contracts/、diagrams/003-*.puml、constitution.md

分析共跑三次。第一次的 MEDIUM 已修正；之後依主對話比對五個子功能交界的結果（以 002 `contracts/server-extension.md`、`contracts/auth-http.md` 為準）修改，第三次重跑。已修正的項目在下表標「已修正」，目前只剩 LOW。

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| F1 | Inconsistency | ~~MEDIUM~~ 已修正 | tasks.md T004；data-model.md §3；003-class.puml | tasks 用到 `SheetGrid.fromApi()`、`toA1()`，類別圖與 data-model 沒有 | 已在類別圖與 data-model 加上兩個方法，PNG 重新產生 |
| C1 | Underspecification | ~~MEDIUM~~ 已修正 | research.md R2；tasks.md T026；spec AC-25 | AC-25 要求連不上 Google 時 15 秒內結束，但 Picker 腳本在瀏覽器端載入失敗的情況沒有規則 | 已在 research R2 與 T026 加上「腳本載入失敗或 15 秒內沒載入 → `UnexpectedError`」 |
| C2 | Underspecification | ~~MEDIUM~~ 已修正 | tasks.md T018；plan.md Project Structure | T018 原本建立 `readOnly.test.ts`，plan 的結構沒有這個檔案；`ImportStore.test.ts`、`importErrors.test.ts` 也沒列 | T018 改寫進既有的兩個測試檔；plan 結構補上兩個測試檔 |
| C3 | Underspecification | ~~MEDIUM~~ 已修正 | data-model.md §3 | `SheetGrid.fromApi(sheet)` 的 `ApiSheet` 型別沒有定義 | 已註明為 `sheets_v4.Schema$Sheet` |
| X1 | Inconsistency | ~~HIGH~~ 已修正 | research R7；tasks T017、T026、T027；plan；三張圖 | 前端用了不存在的 `teacherFetch`，與 002 的 `ApiClient.request(method, path, body?)` 不一致 | 全部改用 `ApiClient`；`HttpGuidedNotesService`、`GooglePickerLauncher` 不再自行轉換錯誤，`ApiError` 直接往上丟 |
| X2 | Inconsistency | ~~HIGH~~ 已修正 | contracts/guided-notes-http.md；research R7；序列圖 | 錯誤格式寫成 `{ error: { code, message } }`；`ImportError` 用 422 回傳，但 `ApiClient` 對非 2xx 只保留 `{ status, code, message }`，`foundHeaders`、`fixSteps` 會遺失 | 錯誤一律為 002 的 `ErrorBody` `{ code, message }`；`POST /read` 以 200 回傳 `ImportSuccess` 或 `ImportError`，前端以 001 的 `isImportError` 區分 |
| X3 | Coverage | ~~MEDIUM~~ 已修正 | research R1、R7；tasks T036、T038、T041、T043 | 沒有處理 Google 授權失效與 `TeacherNotSignedInError` | 新增 `SheetsReadError('AUTH_EXPIRED')`（002 `isGoogleAuthExpired`）→ `401 GOOGLE_AUTH_EXPIRED`；`TeacherNotSignedInError` → `401 NOT_SIGNED_IN`；連不上 Google 改為與 002 相同的 `502 GOOGLE_UNAVAILABLE` |
| X4 | Inconsistency | ~~MEDIUM~~ 已修正 | research R2；序列圖 | picker token 回應欄位寫成文字，未對齊 002 | 改為 002 的 `{ accessToken, apiKey, appId }` |
| X5 | Inconsistency | ~~MEDIUM~~ 已修正 | research R8；tasks T025、T038；plan；組件圖、類別圖 | 路由註冊與 `ImportStore` 共用寫成「伺服器組合根、plugin options」，沒有對齊 002 的 `buildApp`、`app.requireTeacher`，也沒有加入 002 T043 的老師專用路由清單 | 在 `buildApp(config, deps)` 以 `app.register(guidedNotesRoutes)` 註冊、`{ preHandler: app.requireTeacher }`；`app.decorate` 提供 `app.importStore`、`app.spreadsheetReader`（`deps.spreadsheetReader` 可注入替身）；T038 把兩支路由加入 002 的清單 |
| X6 | Underspecification | ~~MEDIUM~~ 已修正 | contracts/import-store.md | 006 版面檢查要重用的 `SpreadsheetReader.load()`、`GuidedNotesParser.parse()` 沒有寫出簽章，也沒保證不更新 `ImportStore` | contracts/import-store.md 新增「給 006 的讀取工具」：兩個簽章、取得方式、失敗型別，並明訂兩者都不讀寫 `ImportStore`（只有 `GuidedNotesImporter.read()` 會 `save()`）；序列圖第 5 段加上 |
| X7 | Inconsistency | ~~LOW~~ 已修正 | diagrams/003-class.png | 類別圖加入 002 的類別後超過 PlantUML 預設寬度上限，PNG 右側被截掉 | 改為由上到下排版並加 `scale max 4000 width`，重新產生 PNG |
| L1 | Inconsistency | LOW | contracts/import-store.md；003-class.puml | 契約寫 `latest(): Readonly<ImportSuccess> \| null`，類別圖寫 `ImportSuccess [0..1]` | 意義相同（唯讀是 TypeScript 型別修飾）；不需修改 |
| L2 | Coverage | LOW | spec REQ-IMP-02 | 「學生不需要 Google 帳號」沒有獨立測試 | 學生流程完全不經過 003；由 AC-26（沒有老師憑證就拒絕）間接涵蓋 |
| L3 | Dependency | LOW | spec「需請 001 修改」；tasks.md T001 | `SubQuestion.marker` 與通用錯誤頁需要 001 先修改，否則 US2 的標記與 US3 的錯誤顯示無法完成 | T001 已設為進入實作前的關卡；請主對話轉告 TingYi |
| L4 | Coverage | LOW | spec SC-004 | 5 秒的端對端時間只能人工計時（T048）；自動化只檢查伺服器解析 1 秒內（T046） | 可接受：端對端時間包含 Google 的網路延遲，自動化測試不得連網（原則 VIII） |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-IMP-01 | ✅ | T017、T026、T027、T039 | |
| REQ-IMP-02 | ✅ | T016、T024、T025、T038 | 授權本身在 002；兩支路由加入 002 T043 的老師專用路由清單 |
| REQ-IMP-03 | ✅ | T010、T014、T015、T023 | |
| REQ-IMP-04 | ✅ | T011、T013、T019 | |
| REQ-IMP-05 | ✅ | T006、T034、T040 | |
| REQ-IMP-06 | ✅ | T012、T013、T020、T021、T034、T040 | |
| REQ-IMP-07 | ✅ | T012、T020、T030、T033 | |
| REQ-IMP-08 | ✅ | T030、T031、T032 | |
| REQ-IMP-09 | ✅ | T001、T030、T033 | 依賴 001 新增欄位 |
| REQ-IMP-10 | ✅ | T004、T012、T020、T034、T040 | |
| REQ-IMP-11 | ✅ | T014、T015、T022 | |
| REQ-IMP-12 | ✅ | T006、T034、T035、T037、T040、T042 | |
| REQ-IMP-13 | ✅ | T026、T036、T038、T039、T041、T043、T044 | 錯誤經 002 `ErrorBody` 與 `ApiClient` |
| REQ-IMP-14 | ✅ | T037、T039、T042 | |
| REQ-IMP-15 | ✅ | T005、T009、T015、T023、T025 | |
| REQ-IMP-16 | ✅ | T013、T021 | |
| REQ-IMP-17 | ✅ | T018 | |
| SC-001 | ✅ | T013、T031、T048 | |
| SC-002 | ✅ | T010、T013、T048 | 3 份變形 fixture |
| SC-003 | ✅ | T035 | |
| SC-004 | ✅ | T046、T048 | 見 L4 |
| SC-005 | ✅ | T037、T048 | |
| SC-006 | ✅ | T036、T041、T048 | |

**Constitution Alignment Issues**: 無。I（三張圖與 PNG、plan 藍圖對照、T049 圖表一致性驗證）、II（每個 REQ 都有 AC 與任務）、III（只換 `createServiceRegistry()` 綁定；`SpreadsheetReader` 抽象）、IV（執行期解析，無法解析回 `ImportError`）、V（`ImportStore` 唯一來源）、VI（`app.requireTeacher` 與 002 老師專用路由清單測試、前端憑證只經 `ApiClient`、log 不含 token，T045）、VII（JSON schema 驗證、7 種錯誤都有原因與修正方式）、VIII（每個 Story 有正常與邊界測試、不連網；T047、T048）、IX、XI 都有對應。

**Unmapped Tasks**: T002（安裝套件）、T003、T007、T008（基礎型別與測試輔助）、T047、T049（流程關卡）屬於基礎設施，不對應單一需求。

## Metrics

- Total Requirements: 17（另有 6 個 SC）
- Total Acceptance Criteria: 26
- Total Tasks: 49
- Coverage: 100%（每個 REQ 至少 1 個任務）
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0（HIGH 0、MEDIUM 0、LOW 4；交界修正前的 HIGH 2、MEDIUM 4 都已修正）

## 跨子功能交界

| 交界 | 結果 |
| --- | --- |
| 001 `GuidedNotesService`、`Spreadsheet`、`ImportSuccess`、`ImportError` | ✅ 簽章與欄位不變；只請 001 新增 `SubQuestion.marker` |
| 001 T-ImportError 頁 | ⚠️ 需 001 改為所有 `ImportError` 共用（spec「需請 001 修改」#2） |
| 002 `buildApp`、`app.requireTeacher`、`app.googleClients`、`isGoogleAuthExpired`、`TeacherNotSignedInError`、`ErrorBody`、`loggerOptions` | ✅ 名稱與用法依 002 contracts/server-extension.md |
| 002 `GET /api/auth/picker-token` | ✅ `{ accessToken, apiKey, appId }`，依 002 contracts/auth-http.md |
| 002 前端 `ApiClient.request(method, path, body?)`、`ApiError` | ✅ 003 所有前端請求都經由它；`ImportError` 以 200 回傳，避開 `ApiError` 只保留三個欄位的限制 |
| 002 T043 老師專用路由清單 | ✅ T038 加入 `GET /api/guided-notes/spreadsheets/:spreadsheetId`、`POST /api/guided-notes/read` |
| 003 → 004、006 `app.importStore.latest()` | ✅ 見 contracts/import-store.md |
| 003 → 006 `app.spreadsheetReader.load()`、`GuidedNotesParser.parse()` | ✅ 簽章寫在 contracts/import-store.md；都不更新 `ImportStore` |

## Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM，可以進入人工審查（原則 X）後再 `/speckit-implement`。
- 實作前先確認 001 已完成「需請 001 修改」#1、#2（T001）。
