# 006 圖表一致性驗證

驗證日期：2026-11-28；程式版本：`66d85eb8`（分支 `006-results-export`，接在 `005-buzz-submission` 之後）加上工作目錄中 T031～T036 尚未提交的變更。

範圍（T034）：`diagrams/006-component.puml`、`diagrams/006-class.puml`、`diagrams/006-sequence.puml` 對照 `server/src/results/*`、`frontend/src/services/ServerResultService.ts`、`frontend/src/services/createServiceRegistry.ts`（`result` 綁定）、`server/src/app.ts`（006 註冊的部分）。001～005 的檔案只確認名稱與被呼叫的介面。「說明」欄的 Dn 對應最後一節「差異與處理」。時序圖第 32 步已依 2026-11-27 的決定改為「這些填空格原本的內容會被覆蓋。」，第 30 步依 2026-11-28 的決定改為「本組搶到的題數」（不另外標示本組），並重新產生 `006-sequence.png`（PlantUML CLI）。

## 組件圖

| 圖上的元素 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 001 頁面（不修改）..> ResultService | `frontend/src/services/interfaces.ts`；`TeacherResultsPage.tsx` 未修改 | 一致 | T035 確認說明文字後不需修改 |
| createServiceRegistry「只換 result 的綁定」 | `createServiceRegistry.ts:30-31` | 一致 | 只為 result 模擬實作存在的 MockSession 橋接一併移除，`isMockMode()` 為 false（D4） |
| ServerResultService -\|> ResultService | `ServerResultService.ts:14` | 一致 | |
| ServerResultService --> RealtimeClient：emitWithAck result:question／result:all | `ServerResultService.ts:20-27, 45-49` | 一致 | |
| ServerResultService --> ApiClient：request('POST', '/api/results/write-back') | `ServerResultService.ts:33-42` | 一致 | |
| app.io --> resultSocketHandlers | `server/src/app.ts:76`；`resultSocketHandlers.ts:21-29` | 一致 | |
| resultSocketHandlers --> GroupMembership：groupOf(socket) | `resultSocketHandlers.ts:25, 28` | 一致 | 由 `app.activity.membership` 取得（D2） |
| ResultQuery --> ActivityStore：current() | `ResultQuery.ts:39, 48, 58` | 一致 | 由 `app.activity.store` 取得（D2） |
| ResultQuery --> SubmissionStore：list(n)、winner(n)，計算 behindFirstMs | `ResultQuery.ts:63-72` | 一致 | 由 005 的 `app.submissions` 取得（D2） |
| resultsRoutes --> app.requireTeacher（preHandler）、--> WriteBackService | `resultsRoutes.ts:13-15` | 一致 | |
| WriteBackService --> ActivityStore、ImportStore、Reparse、ResultQuery | `WriteBackService.ts:125-149` | 一致 | |
| WriteBackService ..> SpreadsheetWriter；GoogleSheetsWriter --> GoogleClientProvider | `app.ts:82`；`GoogleSheetsWriter.ts:13-16` | 一致 | 測試可經 `AppDeps.spreadsheetWriter` 換成替身（D3） |
| 註解：寫回 1～4 步與失敗處理 | `WriteBackService.ts:125-162`；`resultsRoutes.ts:14-21` | 一致 | |

## 類別圖

| 圖上的元素 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 001 的 `QuestionResult`、`Submission`、`SubQuestion`、`WriteBackResult`、`ResultService` | `shared/src/entities.ts`；`frontend/src/services/interfaces.ts` | 一致 | 只確認名稱與簽章 |
| ServerResultService：realtime、api，三個方法 | `ServerResultService.ts:15-42` | 一致 | |
| ResultQuery：activities、submissions、questionResult、allResults、isEnded、visible | `ResultQuery.ts:32-90` | 一致 | 欄位型別為 `Pick<…>`；另有私有 `full()`（D1） |
| ResultQueryError、ResultQueryErrorCode（3 個） | `ResultQuery.ts:5-24` | 一致 | |
| WriteBackService：8 個欄位、writeBack、firstLayoutMismatch、planCells、mapGoogleError | `WriteBackService.ts:78-215` | 一致 | 另有 `log` 欄位與私有 `runExclusively()`、`run()`（D1） |
| WriteBackFailure、WriteBackErrorCode（10 個）、WriteBackStep（3 個） | `WriteBackService.ts:14-64` | 一致 | |
| CellText、SpreadsheetWriter、GoogleSheetsWriter（clients、timeoutMs = 15000） | `SpreadsheetWriter.ts:3-15`；`GoogleSheetsWriter.ts:13-16` | 一致 | |
| cellTextRules：composeCellText、backupName | `cellText.ts:2, 9` | 一致 | |
| registerResultHandlers(io, query, members) | `resultSocketHandlers.ts:21` | 一致 | |
| SubmissionStore <<005>>：list、winner | `server/src/submission/SubmissionStore.ts`（005） | 一致 | 暫時介面 `server/src/temp-deps/` 已刪除 |
| ActivityStore、GroupMembership <<004>> | `server/src/activity/index.ts`（004） | 一致 | 暫時介面已刪除 |

## 時序圖

| 圖上的步驟 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 1～18：getQuestionResult → result:question → groupOf → questionResult → current → list／winner → visible → ack | `ServerResultService.ts:20-22, 45-49`；`resultSocketHandlers.ts:23-26`；`ResultQuery.ts:38-90` | 一致 | |
| 8～11：ResultQueryError → ack ok:false → reject | `resultSocketHandlers.ts`；`ServerResultService.ts:47` | 一致 | |
| 19～30：getAllResults → result:all → allResults | `ServerResultService.ts:25-27`；`resultSocketHandlers.ts:27-29`；`ResultQuery.ts:47-55` | 一致 | 第 30 步的顯示依 001 `StudentResultsPage.tsx`（本組搶到的題數） |
| 32：T-WriteBack「這些填空格原本的內容會被覆蓋。」 | `TeacherResultsPage.tsx:198` | 一致 | 圖已改（REQ-RES-19，2026-11-27 決定） |
| 34～39：writeBack → POST；401 UNAUTHORIZED → WriteBackResult(ok=false) | `ServerResultService.ts:33-39` | 一致 | |
| 40～49：inProgress → current → latest／latestMarkers → allResults(null) → planCells；沒有格子 → cellCount 0 | `WriteBackService.ts:101-139` | 一致 | |
| 50～55：load → 找不到工作表／不能編輯 → parse → firstLayoutMismatch | `WriteBackService.ts:140-150` | 一致 | |
| 56～60：backupName → duplicateSheet → writeTexts | `WriteBackService.ts:152-161` | 一致 | |
| 61～66：200 WriteBackResult；401 GOOGLE_AUTH_EXPIRED → WriteBackResult | `resultsRoutes.ts:14-21`；`ServerResultService.ts:38` | 一致 | |

## 差異與處理

| 編號 | 差異 | 處理 |
| --- | --- | --- |
| D1 | 類別圖沒有畫私有輔助方法（`ResultQuery.full()`、`WriteBackService.runExclusively()`、`run()`）與 `log` 欄位；欄位型別用 `Pick<…>` 只取用到的方法 | 不改圖：它們不改變類別之間的關係與呼叫順序，畫出來只增加雜訊 |
| D2 | 圖上直接連到 ActivityStore、GroupMembership、SubmissionStore；程式經 004 的 `app.activity` 與 005 的 `app.submissions` 取得同一個實例 | 不改圖：取得方式依 004 contracts/server-modules.md 與 005 contracts/submission-store.md「取得方式」，連線對象相同 |
| D3 | `AppDeps.spreadsheetWriter` 讓測試（E2E 測試伺服器）換掉 GoogleSheetsWriter，圖上沒有 | 不改圖：比照 003 的 `AppDeps.spreadsheetReader`，只供測試注入 |
| D4 | createServiceRegistry 換綁 result 時，一併移除只為 result 模擬實作存在的 MockSession 橋接（004 RA-14、003 的 import 轉交） | 不改圖：圖上「只換 result 的綁定」指不動其他介面；001 FR-005 規定全部換成真正實作後不顯示「模擬模式」（T036） |
