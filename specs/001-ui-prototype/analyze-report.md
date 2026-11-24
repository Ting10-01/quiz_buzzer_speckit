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
| U1 | 採 (b)：結束時間不在任何需求內（R4、R8 只要求檢視搶答結果），依原則 XI 移除，列入「相對於設計稿的調整」 | spec FR-040（commit `spec(001): revise spec for analyze and teacher sign-in`）；tasks T070、T076、T096 |
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

---

# 第二次分析（2026-11-22）

**Inputs**: 2026-11-22 修訂後的 spec（commit `spec(001): align ui flow with feature split`）與尚未 commit 的 tasks.md Phase 3.6、data-model.md（C-3）。

## Findings

| ID | Category | Severity | Location(s) | Summary |
| --- | --- | --- | --- | --- |
| H1 | Inconsistency | HIGH | tasks C-4、T068、T073；spec FR-032；contract L12 | C-4 讓 `SubmissionTable` 自行決定可判定的列，但 FR-032 與 contract 規定可判定與否依介面回傳、由負責子功能定義；C-4「005 若改變規則須修改 `SubmissionTable`」也與範圍原則、原則 III 衝突 |
| M1 | Inconsistency | MEDIUM | tasks T113；spec FR-009、M9 | 模擬實作對非最早一筆的 `judge` 以 `UnexpectedError` reject，但 FR-009 規定模擬只回傳 M9 一種非預期錯誤 |
| M2 | Inconsistency | MEDIUM | tasks T132；research RD-11 | T132 把上一頁對照集中在 AppRouter，RD-11 卻寫由各頁宣告、AppRouter 不維護清單 |
| M3 | Underspecification | MEDIUM | tasks T124、T131；類別圖、組件圖、時序圖 | `setViewerPhaseAdvancer`、`advanceViewerPhase`、`closeTopDialog` 不在圖表中 |
| M4 | Coverage | MEDIUM | spec Edge Cases、FR-014；tasks T070 | T-WriteBack 開啟時按上一頁只關閉視窗，沒有測試 |
| L1 | Coverage | LOW | FR-014 | 多數「停留」頁面與「重新整理回到首頁」沒有自動化測試 |
| L2 | Inconsistency | LOW | manual-verification.md；T010 | 紀錄樣板仍是 Q1–Q12，quickstart 已有 Q13、Q14 |
| L3 | Coverage | LOW | spec 頁面清單 T-Live「全部不接受」；T068 | 全部不接受後的狀態沒有測試 |
| L4 | Underspecification | LOW | M5；T113 | 已送出後再次 `submitAnswer` 時模擬實作的行為未定義 |
| L5 | Style | LOW | spec Clarifications；tasks 需求對照表 | 問答順序錯置、FR-056a 列位置錯置 |

Metrics：需求 48（FR 41、SC 7）、任務 134、覆蓋率 100%、CRITICAL 0、HIGH 1。

## 處理紀錄（2026-11-22）

| ID | 決定 | 修改位置 |
| --- | --- | --- |
| H1 | 採 (a)：feature-split 3.2 已定案「只能判定最早一筆」，FR-032 改為頁面依回傳列表套用此規則，變更須先改 feature-split 與 spec，不屬於 005 的擴充點 | spec FR-032（commit `spec(001): align ui flow with feature split`）；contract 共通規則；tasks C-4 |
| M1 | 改丟一般的 `Error`（程式錯誤，頁面不會觸發） | tasks T113 |
| M2 | 保留 T132 的集中對照表，改寫 RD-11 | research RD-11 |
| M3 | 圖表補上方法並重新產生 PNG | 類別圖 `MockSession`；時序圖 M6 段；組件圖 `AppRouter ..> ConfirmDialog`；research RD-11 |
| M4 | 加入 T-WriteBack 的 `popstate` 案例 | tasks T070 |
| L1 | 加入停留頁面的 `goBack()` 與 `reload()` 斷言 | tasks T093 |
| L2 | 新增 T134 修改紀錄樣板 | tasks Phase 3.6 |
| L3 | 加入全部不接受的案例 | tasks T068 |
| L4 | 已送出後再呼叫丟出一般的 `Error` | tasks T113 |
| L5 | 問答依序排列；FR-056a 列移到 FR-056 之後 | spec Clarifications；tasks 需求對照表 |

處理後沒有未處理的 CRITICAL 或 HIGH 問題，符合 CLAUDE.md 第 2 節步驟 5 的通過條件。

---

# 第三次分析（2026-11-24）

**Inputs**: 圖表一致性驗證 F4 後的 spec 修訂（commit `spec(001): handle activity cancellation on 001 pages`）、設計更新（commit `spec(001): notify no activity through phase change in diagrams`、`spec(001): sync plan with activity cancellation handling`），以及尚未 commit 的 tasks.md Phase 8.5（T147–T156）。另對照 `HomePage.tsx`、`JoinPage.tsx`、`StudentPlayPage.tsx`、`interfaces.ts`、`MockActivityService.ts`、`studentHarness.tsx` 的現況，確認任務可行。

## Findings

| ID | Category | Severity | Location(s) | Summary |
| --- | --- | --- | --- | --- |
| I1 | Inconsistency | MEDIUM | tasks T147；`StudentPlayPage.tsx` 的 `usePhaseChange` | T147 要求頁面只補型別、不改行為且 typecheck 通過，但 `usePhaseChange` 的 handler 只收 `Activity`，介面改為 `Activity \| null` 後無法通過；在此過濾 `null` 會讓 T152 未寫測試就通過並提前做了 T155 的事 |
| A1 | Ambiguity | MEDIUM | spec FR-051；contract `onPhaseChange`；research RD-12；時序圖第 3 段；quickstart Q15 | FR-051 寫等待開放頁收到 `null` 時「不呼叫任何介面」，但切換後的選組頁載入時會呼叫 `getCurrentActivity()`；原意是不呼叫 `leaveGroup` |
| I2 | Inconsistency | LOW | tasks T103 | T103 寫「T150–T153 的元件測試結果」，測試任務實為 T149–T152 |
| D1 | Duplication | LOW | tasks T103、T156 | T103 與 T156 都把 Q15 記錄到 `manual-verification.md` |
| U1 | Underspecification | LOW | tasks T149、T153 | `HomePage` 已能處理 `null`，T149 寫完即通過、不是先失敗的測試，任務沒有說明 |

Metrics：需求 49（FR 與 SC）、任務 158（未完成 11）、覆蓋率 100%、CRITICAL 0、HIGH 0。

## 處理紀錄（2026-11-24）

| ID | 決定 | 修改位置 |
| --- | --- | --- |
| I1 | `usePhaseChange` 維持 handler 型別為 `Activity`，T147 暫時以 `as Activity` 轉呼叫、不過濾 `null`，T155 移除 | tasks T147、T155 |
| A1 | FR-051 改為「不呼叫『離開組別』，切換後的選組頁與一般進入時相同，載入時取得目前活動」；選組頁本身收到 `null` 時仍不呼叫任何介面。修改併入既有的三筆 commit | spec FR-051（commit `spec(001): handle activity cancellation on 001 pages`）；時序圖第 3 段與 PNG（commit `spec(001): notify no activity through phase change in diagrams`）；contract `onPhaseChange`、research RD-12、quickstart Q15（commit `spec(001): sync plan with activity cancellation handling`）；tasks Phase 8.5 說明 |
| I2 | 改為 T149–T152 | tasks T103 |
| D1 | 由 T156 記錄，T103 只確認已記錄 | tasks T103 |
| U1 | T149 註明預期在 T147 後即通過，失敗時於 T153 修正 | tasks T149 |

處理後沒有未處理的 CRITICAL 或 HIGH 問題，符合 CLAUDE.md 第 2 節步驟 5 的通過條件。
