# Quickstart: 匯入學習單

**Feature**: `003-guided-notes-import` | 驗證本功能是否完成的操作手冊。介面與資料見 [contracts/](contracts/) 與 [data-model.md](data-model.md)，這裡不重複。

## 前置條件

- 001、002 已完成：頁面、`GuidedNotesService` 介面、伺服器骨架、Google 登入與 `GET /api/auth/picker-token` 可用。
- Google Cloud 專案已啟用 Google Sheets API、Google Drive API、Google Picker API；環境變數 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_APP_ID` 由使用者自行設定（設定方式見 002，本文件不讀也不寫 `.env`）。
- 老師帳號的雲端硬碟中有下列 Google 試算表（由 `docs/templates/*.xlsx` 匯入 Google 試算表後修改）：
  1. 單題範本（6 題）
  2. 題組範本（4 題，其中 2 個題組）
  3. 變形 A：表頭在第 7 列、題號在 D 欄、作答在 I 欄
  4. 變形 B：表頭上方多一段說明文字、題與題之間空兩列
  5. 變形 C：表頭寫「編號」「題幹」「答案」，題目欄在作答欄右邊
  6. 表頭寫「No.」「內容」「學生填寫」
  7. 題號 1、2、4
  8. 題號重複（兩個 2）
  9. 第一個工作表「說明」沒有表頭、第二個工作表「學習單」是單題範本
  10. 一份由另一個帳號共用、只有檢視權限的試算表（先由老師在 Picker 中挑選一次）

## 自動化測試

| 指令 | 內容 | 預期 |
| --- | --- | --- |
| `npm run typecheck` | `shared/`、`frontend/`、`server/` 型別檢查 | 沒有錯誤 |
| `npm test -w server -- guided-notes` | 解析、讀取器、路由（不連網） | 全部通過 |
| `npm test -w frontend -- HttpGuidedNotesService` | 前端服務（假的 `ApiClient` 與 Picker） | 全部通過 |

## 人工驗證情境

`npm run dev` 啟動後，首頁選「我是老師」並用 Google 登入，進入挑選學習單頁。

| # | 操作 | 預期結果 | 對應 |
| --- | --- | --- | --- |
| 1 | 挑選單題範本 | 6 題、0 題組、6 個填空格 G5、G7…G15；可編輯；表頭第 4 列 B、C、G 欄 | AC-01、SC-001 |
| 2 | 挑選題組範本 | 4 題、2 題組；第 1 題 G5、G6，第 2 題 G8、G9；第 1 題敘述兩行各以（1）（2）開頭 | AC-11、AC-12、AC-15、SC-001 |
| 3 | 依序挑選變形 A、B、C | 三份都正確辨識，位置跟著改變 | AC-03、AC-08、SC-002 |
| 4 | 挑選試算表 9 | 預設讀「學習單」；工作表清單為「說明」「學習單」 | AC-05 |
| 5 | 在 #4 的結果切換到「說明」 | 進入找不到表頭頁（T-ImportError，`NO_HEADER`） | AC-06、AC-17 |
| 6 | 挑選試算表 6 | 找不到表頭頁列出「No.」「內容」「學生填寫」、可用的表頭寫法與修正方式 | AC-17 |
| 7 | 在 #6 的找不到表頭頁，到 Google 試算表把表頭改成「題號」「作答」後按「重新讀取」 | 進入確認辨識結果頁 | AC-17 |
| 8 | 挑選試算表 7、8 | 7：3 題（1、2、4）；8：進入找不到表頭頁（標題不準確是已知限制），錯誤原因指出重複的題號與列，表頭兩區為空、有修正方式（`INVALID_NUMBERING`） | AC-09、AC-19 |
| 9 | 挑選試算表 10 | 照常辨識，顯示「僅檢視」 | AC-07 |
| 10 | 開啟選擇器後直接關閉 | 留在原頁，畫面不變 | AC-16 |
| 11 | 先成功匯入題組範本，再挑選試算表 6；之後到 T-Setup 建立活動 | 活動的題目是題組範本的 4 題（`ImportStore` 沒有被錯誤取代） | AC-18、SC-005 |
| 12 | 關閉網路後挑選或重新讀取 | 15 秒內在共通錯誤訊息區顯示連線錯誤 | AC-25、SC-006 |
| 13 | 在另一個分頁（沒有老師憑證）直接呼叫 `POST /api/guided-notes/read` | `401 UNAUTHORIZED`，沒有讀取試算表 | AC-26 |
| 14 | 每次匯入前後比對試算表的版本紀錄 | 沒有任何修改 | AC-10 |
| 15 | 計時：從在選擇器按「選取」到看到辨識結果 | 5 秒內 | SC-004 |

人工驗證結果記錄在 `specs/003-guided-notes-import/manual-verification.md`（日期、驗證者、情境、結果、問題）。
