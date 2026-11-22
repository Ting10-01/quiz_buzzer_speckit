# Specification Analysis Report: 006 結果與寫回

**Date**: 2026-11-21（第三輪：對齊 002～005 的交界後重跑） | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、research.md、data-model.md、contracts/results-api.md、tasks.md、diagrams/006-*.puml、constitution.md；對照 002 contracts/server-extension.md、socket-handshake.md，003 contracts/import-store.md、data-model，004 contracts/server-modules.md、data-model，005 contracts/submission-store.md

## 第一輪發現並已修正

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| F1 | Coverage | HIGH | spec.md REQ-RES-06；tasks.md 追溯表 | REQ-RES-06（題號不存在、沒有活動）沒有任何驗收準則，違反原則 II | AC-05 加入「第 9 題 → 沒有這一題」「沒有活動 → 目前沒有活動」 |
| F2 | Inconsistency | MEDIUM | spec.md REQ-RES-14 與「寫回失敗原因」表 | 「寫回進行中」的訊息沒有說明沒有寫入任何格子 | REQ-RES-14 明列兩種例外 |
| F3 | Constitution（III） | MEDIUM | tasks.md T002 | 伺服器測試替身寫成「取自前端的 `MockFixtures`」 | 改為「內容相同」，伺服器測試不引用前端檔案 |

## 第二輪：跨子功能交界（主對話比對後）並已修正

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| X1 | Inconsistency | HIGH | spec、research RD-04、data-model、三張圖、tasks | 版面檢查用了 003 沒有的 `WorksheetReader.read()`；`ImportStore.latest()` 寫成 `StoredImport` | 改用 003 contracts/import-store.md「給 006 的讀取工具」：`app.spreadsheetReader.load()`、`new GuidedNotesParser().parse(grid, latest.spreadsheet)`（都不讀寫 `ImportStore`）；`latest()` 為 `Readonly<ImportSuccess>`，標記取自 `SubQuestion.marker`；`sheetId` 與現有工作表名稱取自同一次 `load`，`SpreadsheetWriter` 拿掉 `sheetTitles` |
| X2 | Inconsistency | HIGH | contracts、research RD-07／RD-09、data-model、tasks | 錯誤格式、前端 HTTP、授權失效代碼與 002 不同 | 沿用 002 `ErrorBody`、`ApiClient.request`、`isGoogleAuthExpired` → `401 GOOGLE_AUTH_EXPIRED`、`app.googleClients`；路由以 `app.register` 在 `buildApp` 註冊、`{ preHandler: app.requireTeacher }`，並加入 002 T043 的老師路由清單（T027）。因 002 `ApiClient` 遇到非 2xx 只保留 `{ status, code, message }`，寫回的預期失敗改為一律 `200` + `WriteBackResult { ok: false }`，非 2xx 只用於兩種 401 與 500 |
| X3 | Inconsistency | HIGH | research RD-03、data-model、類別圖、時序圖 | 「一題已結束」用題號順序推算；前端連線、socket 伺服器名稱與 004 不同 | 改讀 004 `ActivityState.endedAt.has(n)`；socket 處理註冊在 002 的 `app.io`；前端用 004 的 `RealtimeClient.emitWithAck`（5 秒逾時由它處理） |
| X4 | Inconsistency | MEDIUM | data-model、類別圖、時序圖、tasks | `SubmissionStore` 方法名稱未定 | 改為 005 contracts/submission-store.md 的 `list(n): Submission[]`、`winner(n): Submission \| null` |
| X5 | Inconsistency | MEDIUM | spec「寫回失敗原因」表 | 授權失效、老師憑證失效的文字與 002 的「請回首頁重新登入」不一致；Google 回應失敗（非逾時）沒有對應的列 | 文字改為「請回首頁重新登入…」；「連不上 Google」一列涵蓋 Google 回應失敗 |

## 第三輪（修正後重跑）

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| L1 | Dependency | LOW | tasks.md T032；spec「需請 001 修改」C1 | 確認視窗文字（AC-11、REQ-RES-19）由 001 頁面顯示 | 001 完成 C1 後再執行 T032 這一項；已在 T032 註明 |
| L2 | Dependency | LOW | data-model、tasks T002 | 寫入「標記＋答案」依賴 003 要求 001 新增的 `SubQuestion.marker` | 跟著 003 的「需請 001 修改」處理；006 不另外要求 |
| L3 | Underspecification | LOW | spec AC-26、research RD-06 | 寫入請求逾時時無法確認 Google 是否已套用，屬於 D20 的例外 | 已記錄在 clarify，列入「待使用者確認」 |
| L4 | Consistency | LOW | research RD-04 | 003 建議「找不到工作表」視為版面不一致；006 改回報 `SHEET_NOT_FOUND`（訊息較明確） | 兩者都不寫入，只差訊息；不需修改 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-RES-01～06（結果的公布） | ✅ | T004～T015、T032 | 公布範圍的窮舉測試 T011（SC-006） |
| REQ-RES-07～18、20（寫回） | ✅ | T016～T030、T033 | 每種失敗都斷言沒有呼叫 `writeTexts`（T026）；`ImportStore.save` 沒有被呼叫（T017） |
| REQ-RES-19（D19 文字） | ✅ | T032 | 依 001 C1 |
| SC-001～SC-004、SC-008 | ✅ | T033（人工），SC-008 另有 T017 | 真實 Google 只做人工驗證（原則 VIII） |
| SC-005 | ✅ | T006 | 200 個連線 |
| SC-006 | ✅ | T011、T032 | |
| SC-007 | ✅ | T026、T033 | |

29 條 AC 全部出現在 tasks.md。

**Constitution Alignment Issues**: 無。I（三張圖已更新並重新產生 PNG，plan「藍圖對照」逐一對應，T034 驗證）；II（每條需求都有 AC 與任務）；III（只新增實作、只改組合根一行與 `buildApp` 的註冊；`SpreadsheetWriter` 隔離 Google 寫入；讀取與解析重用 003）；IV（只寫 003 的 `blankCell`，版面檢查用 003 的解析規則）；V（結果不另存，直接讀 004 `endedAt` 與 005 `list`／`winner`）；VI（伺服器端過濾：T004、T005、T011；寫回需老師憑證：T027；log 不含憑證）；VII（每種失敗的原因逐字比對：T026）；VIII（每個 Story 都有正常與邊界測試，T033 人工驗證）；XI（沒有 CSV、本機紀錄、重啟恢復）。

**Unmapped Tasks**: T001～T003（測試替身與型別）、T031（換綁定）、T034（圖表驗證），不需對應單一需求。

## 跨文件一致性

| 檢查 | 結果 |
| --- | --- |
| data-model 與 006-class.puml 的類別、欄位、方法 | ✅ 一致 |
| data-model「寫回步驟」與 006-sequence.puml 第 3 段的順序 | ✅ 一致 |
| contracts 的回應與 spec「寫回失敗原因」表 | ✅ 預期失敗為 `200 ok: false`；`GOOGLE_AUTH_EXPIRED`、`UNAUTHORIZED` 為 401，由前端轉成 `WriteBackResult` |
| 002 交界（`buildApp`、`app.requireTeacher`、`app.googleClients`、`isGoogleAuthExpired`、`app.io`、`ErrorBody`、`ApiClient`） | ✅ 名稱與簽章一致 |
| 003 交界（`app.importStore`、`app.spreadsheetReader.load`、`GuidedNotesParser.parse`、`SheetsReadError` 三種 `kind`、`SheetGrid.sheetId`） | ✅ 一致 |
| 004 交界（`ActivityStore.current(): ActivityState \| null`、`endedAt`、`GroupMembership.groupOf`、`RealtimeClient.emitWithAck`） | ✅ 一致 |
| 005 交界（`SubmissionStore.list`、`winner`） | ✅ 一致 |
| 001 實體 | ✅ 006 不新增或修改欄位；需要 001 改頁面的地方列在 spec C1～C4 |
| 不做的項目（CSV、本機紀錄、重啟恢復、開新一輪、舊答案提醒） | ✅ 沒有對應的設計或任務 |

## Metrics

- Total Requirements: 20
- Total Acceptance Criteria: 29
- Total Success Criteria: 8
- Total Tasks: 34
- Coverage: 100%
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0（HIGH 0、MEDIUM 0、LOW 4）

## Next Actions

- 沒有 CRITICAL、HIGH、MEDIUM，依 CLAUDE.md 第 2 節，經人工審查後可進入 `/speckit-implement`。
- 實作前請 TingYi 處理 spec「需請 001 修改」C1～C4（以及 003 要求的 `SubQuestion.marker`）。

---

## 第 4 次分析（配合 001 最終版，2026-11-22）

**對照**: 001 最終版（`specs/001-ui-prototype/`、`diagrams/001-*`，PR #10）、`docs/feature-split.md` 最新版、003 contracts/import-store.md（`latestMarkers()`）、004 data-model（`ActivityState`）、005 contracts/submission-store.md。上面第 1～3 輪的 L1、L2 與「需請 001 修改 C1～C4」已被本輪取代。

### 發現並已修正

| ID | Category | Severity | Location(s) | Summary | 修正 |
|----|----------|----------|-------------|---------|------|
| A1 | Coverage | HIGH | spec、data-model、contracts、類別圖 | 001 新增 `QuestionResult.behindFirstMs` 與 D23（第一名的定義交給 006），006 沒有需求、AC 與計算方式 | 新增 REQ-RES-21、AC-30；D23 定為最早送出的組別（research RD-12）；`ResultQuery` 計算，contracts 與類別圖加入欄位 |
| A2 | Inconsistency | HIGH | spec REQ-RES-03、AC-02；contracts；research RD-02 | 整輪結束前回傳本組送出時帶真正的順位；feature-split 第 4 節只在整輪結束後公開順位 | 整輪結束前每筆 `Submission`（含 `winner`）`rank` 填 0、`behindFirstMs` 值為 0（與 005 相同做法，等 001 把 `rank` 改成可選） |
| A3 | Inconsistency | HIGH | data-model、類別圖、時序圖、tasks | 小題標記用 `SubQuestion.marker`，001 最終版沒有這個欄位 | 改用 003 `app.importStore.latestMarkers()[blankCell]`（只在伺服器）；寫回預覽顯示不含標記的答案，寫在 Assumptions |
| A4 | Inconsistency | MEDIUM | spec「需請 001 修改」 | C1～C4 仍要求 001 修改；使用者 2026-11-22 決定不再請 001 改 | 改為「無」：確認視窗文字依 001 FR-041 由 006 決定（新增 T035 確認頁面文字）；公布範圍已由 feature-split 第 4 節定案；結束時間已從 001 移除；預覽不含標記 |
| A5 | Inconsistency | MEDIUM | research RD-03、data-model `isEnded` | 001 與 feature-split：最後一題結束或被接受時直接進入 `FINISHED`，不經過「本題已結束」 | `isEnded` 改為 `phase === FINISHED \|\| endedAt.has(n)`；Edge Cases、時序圖註記 |
| A6 | Underspecification | MEDIUM | spec AC-24、Edge Cases、quickstart 13 | 001 D21 尚未實作：老師重新登入後回不到結果頁，原本「重新登入後再寫回可以成功」做不到；002 任何人登入都會取代老師 | AC-24、Edge Cases 寫明暫時限制；Assumptions 寫明寫回使用最後登入帳號的授權 |
| A7 | Coverage | MEDIUM | spec Clarifications、tasks | S-QuestionDone 也呼叫 `getAllResults`（001 contracts） | Clarifications 與 AC-10 寫明同一套公布範圍；T032 檢查題目進度只含已結束的題目 |

### 重跑結果

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| L5 | Dependency | LOW | spec AC-24、Edge Cases | 寫回失敗後重新登入無法回到結果頁，直到 001 完成 D21 | 已寫明為暫時限制；001 實作 D21 後不需再改 006 |
| L6 | Consistency | LOW | spec Assumptions | 001「相對於設計稿的調整」仍把「寫回前建立備份工作表」列為移除的畫面元素 | 006 的備份只在伺服器執行、頁面不顯示，與該表不衝突；已寫明 |
| L3 | Underspecification | LOW | spec AC-26 | 寫入逾時無法確認（沿用） | 已列為待使用者確認 |
| L4 | Consistency | LOW | research RD-04 | 找不到工作表回報 `SHEET_NOT_FOUND`（沿用） | 不需修改 |

**Constitution Alignment Issues**: 無。VI：整輪結束前不公開順位與差距、學生只拿到本組的送出，在伺服器端過濾（001 contracts「學生端只取得可公開的結果」）；II：新增的 REQ-RES-21 有 AC-30 與 T011、T014、T032；I：三張圖已更新並重新產生 PNG。

### Metrics（第 4 次）

- Total Requirements: 21
- Total Acceptance Criteria: 30
- Total Success Criteria: 8
- Total Tasks: 35
- Coverage: 100%（每條需求與 AC 都有任務）
- Critical Issues Count: 0（HIGH 0、MEDIUM 0、LOW 4）
