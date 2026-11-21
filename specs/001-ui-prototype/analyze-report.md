# Specification Analysis Report: 001-ui-prototype

**Date**: 2026-11-21 | **Inputs**: spec.md、plan.md、tasks.md、data-model.md、contracts/、quickstart.md、diagrams/001-*.puml、constitution v1.0.0

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| U1 | Underspecification | HIGH | spec.md FR-040；data-model.md §1；001-class.puml；tasks.md T070、T076 | FR-040 要求 T-Results 顯示「結束時間」，但 `Activity`、`QuestionResult` 與 `ResultService` 都沒有提供結束時間的欄位或方法。頁面只能自己產生時間，違反 FR-003「頁面不得直接產生結果資料」，T070 的斷言也沒有資料來源 | 擇一：(a) 在類別圖與 data-model 加入欄位（例如 `Activity.endedAt` 或 `getAllResults` 回傳的結果摘要），更新 contract、MockFixtures、T012、T070；(b) 若結束時間不需要，先修改 spec 移除 FR-040 的「結束時間」。兩者都要先改 spec／圖表，再重跑 plan、tasks |
| U2 | Underspecification | MEDIUM | spec.md FR-021、FR-040；data-model.md `ImportSuccess`；tasks.md T061 | FR-021 的「學習單預覽（標示填空格）」與 FR-040 的「寫回預覽」需要工作表的儲存格內容，但 `ImportSuccess` 只有表頭位置與 `blankCell`，沒有其他儲存格內容。T061 的 `SheetPreview` 能畫出的只有格線與填空格位置 | 在 spec 或 data-model 明定預覽的範圍（只標示填空格位置即可，或需要儲存格內容）；若需要內容，於類別圖與 `ImportSuccess` 增加欄位 |
| I1 | Inconsistency | MEDIUM | tasks.md L39–43 | 「已解決的文件衝突」表格後殘留一段重複的 C-1、C-2 列與孤立的 `--- \| --- \| ---`，內容仍寫「建議修改 contract」，與上方「已修改」的決定矛盾，且破壞 Markdown 表格 | 刪除 L39–43 的殘留內容 |
| I2 | Inconsistency | MEDIUM | tasks.md T052、T065 | 任務間的交叉引用編號錯誤：T052 寫「行為於 T060 完成」，實際是 T062（T060 是 E2E 測試）；T065 寫「行為於 T072 完成」，實際是 T074（T072 是 `QuestionProgress`） | 改為 T062、T074 |
| C1 | Constitution | MEDIUM | plan.md Constitution Check 原則 X | 原則 X 一列仍標「待審查」，但 tasks 已產生。若已經人工審查，只是紀錄未更新；若尚未審查，則違反原則 X（CRITICAL） | 確認已審查後改為「通過」並註明日期；未審查則先審查 plan |
| C2 | Constitution | MEDIUM | tasks.md T008、T006；constitution 原則 VIII | `index.html` 由 Google Fonts 載入字型，Playwright E2E 會連到外部服務。字型載入失敗不影響斷言，但與「自動化測試不得依賴真實的外部服務」的精神有出入，離線時也會有網路請求 | 改為本機字型檔（例如 `@fontsource`），或在 plan 註明這是不影響測試結果的資源，並讓 Playwright 阻擋該網域 |
| I3 | Inconsistency | LOW | spec.md Key Entities「題目結果」；data-model.md §1 規則 | spec 把「各送出比第一名慢的秒數」列為題目結果的屬性；data-model 決定由頁面計算，不設欄位。與 FR-003 的界線（頁面不產生結果資料）有些模糊 | 在 spec Key Entities 註明此值為呈現時由 `elapsedMs` 計算，或於 `QuestionResult` 加欄位 |
| I4 | Inconsistency | LOW | data-model.md §2 L48–51 | 介面表中間插入一段說明文字，`ResultService` 及之後的列與表頭斷開，Markdown 不會渲染成同一張表 | 把說明段落移到表格之後 |
| E1 | Coverage | LOW | spec.md US2 AC-9；tasks.md T058 | AC-9 要求「儲存設定」（修改模式）也能顯示驗證失敗，但 T058 只對 `createActivity` 斷言 `ValidationError`，修改模式只測成功路徑 | 在 T058 加上 `updateSettings` 回傳 `ValidationError` 的案例 |
| E2 | Coverage | LOW | spec.md Edge Cases「一題結束時沒有任何組別送出」；tasks.md T083 | 該 Edge Case 適用於 T-QuestionEnd 與 S-QuestionDone；T069 測了老師端兩種狀態，T083 只寫「或沒有組別成功」，學生端「沒有組別送出」沒有明確斷言 | 在 T083 補上「沒有組別送出」的案例 |
| A1 | Ambiguity | LOW | spec.md FR-051 | S-Wait 要顯示「目前階段（準備中／搶答中／已結束）」，但依「階段推動的切換」表，學生只在準備中停留於 S-Wait（搶答中會切到 S-Answer），另外兩種階段實際上不會出現 | 確認是否只需顯示「準備中」；保留時在 spec 說明何時會出現 |
| E3 | Coverage | LOW | spec.md SC-005、SC-006；tasks.md T055、T092 | 兩條計時類 SC 只有人工驗證，沒有自動化測試。原則 II 要求每條需求能追溯到測試；計時類以人工驗證合理，但人工驗證紀錄需包含計時結果 | 在 `manual-verification.md` 樣板（T010）加上「耗時」欄位 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --- | --- | --- | --- |
| FR-001 | ✅ | T034、T050–T053、T063–T065、T074–T076、T086–T090、T093 | |
| FR-002 | ✅ | T044–T047、T056–T059、T068–T070、T079–T083、T093 | |
| FR-003 | ✅ | T007、T014–T016、T031、T100 | |
| FR-004 | ✅ | T017–T031 | |
| FR-005 | ✅ | T037、T042、T093、T097 | |
| FR-006 | ✅ | T020、T028、T047、T080–T083、T093 | |
| FR-007 | ✅ | T036、T038、T054 | |
| FR-008 | ✅ | T058、T064、T081、T087、T094 | 修改模式驗證失敗未測（E1） |
| FR-009 | ✅ | T017、T036、T039、T045、T057、T058、T069、T081、T095 | |
| FR-010–FR-013 | ✅ | T044、T045、T050、T051 | |
| FR-020 | ✅ | T046、T052、T056、T062 | |
| FR-021、FR-022 | ✅ | T057、T061、T063 | 預覽資料來源未定（U2） |
| FR-023、FR-024 | ✅ | T058、T064 | |
| FR-025 | ✅ | T059、T065 | |
| FR-030–FR-034 | ✅ | T068、T069、T072–T075 | |
| FR-040 | ⚠️ | T070、T076 | 「結束時間」沒有資料來源（U1） |
| FR-041、FR-042 | ✅ | T070、T076 | |
| FR-050 | ✅ | T047、T053、T079、T085 | |
| FR-051 | ✅ | T080、T086 | |
| FR-052、FR-053 | ✅ | T081、T087 | |
| FR-054 | ✅ | T029、T084、T087 | |
| FR-055、FR-056 | ✅ | T082、T088 | |
| FR-057 | ✅ | T083、T089 | |
| FR-058 | ✅ | T083、T090 | |
| FR-060（M1–M9） | ✅ | T017–T030 | |
| FR-061 | ✅ | T037、T041、T094、T095 | |
| SC-001、SC-002 | ✅ | T093、T095 | 流程圖箭頭 H1–H2、T1–T15、S1–S5 皆存在於 `001-screen-flow.puml` |
| SC-003 | ✅ | T037、T093、T097 | |
| SC-004 | ✅ | T096 | |
| SC-005、SC-006 | ✅（人工） | T055、T092 | E3 |
| SC-007 | ✅ | T084 | |

**Constitution Alignment Issues:** C1（原則 X 紀錄未更新）、C2（原則 VIII，E2E 載入外部字型）。原則 I 的三張圖與 PNG 均存在；原則 III 以 ESLint 強制（T007、T100）；原則 VI、XI 無問題。

**Unmapped Tasks:** 無。Setup（T001–T011）與 Polish（T100–T103）為基礎設施與品質關卡任務。

## Metrics

- Total Requirements: 45（FR 38、SC 7）
- Total Tasks: 103
- Coverage: 100%（每條需求至少一個任務；FR-040 部分內容無資料來源）
- Ambiguity Count: 1
- Duplication Count: 0
- Critical Issues: 0
- High Issues: 1（U1）

## Next Actions

- 依 CLAUDE.md 第 2 節步驟 5 的通過條件，**U1（HIGH）處理前不得進入 `/speckit-implement`**。處理方式會改變介面或 spec，依原則 II：先修改 spec（或類別圖與 data-model），再重跑 `/speckit-plan`、`/speckit-tasks`。
- C1 需確認 plan 是否已人工審查；若尚未審查，視同 CRITICAL。
- I1、I2、I4 是文件整理，可直接手動修改 tasks.md、data-model.md。
- 其餘 MEDIUM／LOW 可在處理 U1 時一併修正，或記錄後延後處理。

## 處理紀錄（2026-11-21）

| ID | 決定 | 修改位置 |
| --- | --- | --- |
| U1 | 採 (b)：結束時間不在任何需求內（R4、R8 只要求檢視搶答結果），依原則 XI 移除，列入「相對於設計稿的調整」 | spec FR-040（commit `spec(001): revise spec for analyze findings and teacher sign-in`）；tasks T070、T076、T096 |
| U2 | 預覽只呈現辨識結果（表頭列、題號、題目敘述、填空格位置），不呈現其他儲存格內容 | spec FR-021；tasks T061 |
| I1 | 刪除殘留的重複列 | tasks「已解決的文件衝突」 |
| I2 | 改為 T062、T074 | tasks T052、T065 |
| C1 | 原則 X 改為「通過（2026-11-21 人工審查）」 | plan Constitution Check |
| C2 | 改用 `@fontsource` 本機字型 | research「字型」；plan Summary、Primary Dependencies；tasks T003、T008、T035 |
| I3 | `QuestionResult` 新增 `behindFirstMs`，由服務計算，頁面只顯示（FR-003）；「第一名」的定義交給 006（D23），001 模擬以最早送出計算 | spec FR-040、M4、Key Entities、D23；類別圖與 PNG；data-model；contract；plan G-5；tasks T012、T022、T030、T070、T076 |
| I4 | 說明段落移到介面表之後 | data-model 第 2 節 |
| E1 | 加入 `updateSettings` 驗證失敗案例 | tasks T058 |
| E2 | 加入「沒有組別搶答成功」「沒有組別送出」案例 | tasks T083 |
| A1 | S-Wait 的階段一律為準備中 | spec FR-051；tasks T080 |
| E3 | 人工驗證紀錄加「耗時」欄位 | tasks T010 |

處理後沒有未處理的 CRITICAL 或 HIGH 問題，符合 CLAUDE.md 第 2 節步驟 5 的通過條件。
