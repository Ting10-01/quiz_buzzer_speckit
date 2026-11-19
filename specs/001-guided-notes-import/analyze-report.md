# Specification Analysis Report: 001 Guided Notes 匯入

**Date**: 2026-11-18 | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、tasks.md、constitution.md

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| C1 | Underspecification | ~~MEDIUM~~ 已修正 | tasks.md T011–T017；plan.md Project Structure | 共用骨架的檔案（`server/src/index.ts`、`http/errors.ts`、`http/requireTeacher.ts`、`web/src/App.tsx`、`pages/HomePage.tsx`、`styles/tokens.css`、`shared/src/{index,activity,socket-events,results}.ts`）出現在 tasks，但沒有任何 plan 的結構或藍圖對照列出它們 | 在 plan.md 的 Project Structure 加一節「共用骨架」列出這些檔案與負責人 |
| E1 | Coverage | ~~MEDIUM~~ 已修正 | spec.md SC-002；tasks.md T021 | SC-002 要求至少 3 份變形試算表不改程式就能匯入，tasks 只有 1 份變形（AC-03） | 在 T022 的 fixtures 加入 3 份變形（表頭與欄位位置不同、間隔列不同），T021 逐一驗證 |
| C2 | Underspecification | LOW | tasks.md T040、T055；plan.md「components/（SheetPreview、WarningCard…）」 | `QuestionSummary`、`ErrorCard`、`GoogleAccountBadge` 沒有寫進 plan | 在 plan.md 的 components 列出完整清單 |
| E2 | Coverage | LOW | spec.md AC-02；tasks.md T025、T036 | AC-02（確認後保存題目清單與來源）由 T025、T036 涵蓋，但沒有明確引用 | 在 T025 的描述加上 AC-02 |
| E3 | Coverage | LOW | spec.md SC-003、SC-005 | SC-003（錯誤訊息讓老師能自行修正）由 T054 涵蓋、SC-005（1 分鐘內完成）由 T060 涵蓋，但沒有明確引用 | 在 T054、T060 加上 SC 編號 |
| U1 | Traceability | LOW | tasks.md 需求追溯表 | 測試任務 T026（AC-05、AC-06）、T043、T051 屬於 User Story，但沒有出現在追溯表 | 把 T026 加到 REQ-IMP-02，T043 加到 REQ-IMP-08，T051 加到 REQ-IMP-11 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-IMP-01 | ✅ | T032、T036、T039、T041 | |
| REQ-IMP-02 | ✅ | T006、T023、T024、T033–T035、T040、T057、T058 | 安全相關；有機密掃描測試 |
| REQ-IMP-03 | ✅ | T025、T032、T036、T041 | |
| REQ-IMP-04 | ✅ | T019、T029 | |
| REQ-IMP-05 | ✅ | T049、T053、T055、T056 | |
| REQ-IMP-06 | ✅ | T020、T021、T031、T048 | |
| REQ-IMP-07 | ✅ | T020、T021、T030 | |
| REQ-IMP-08 | ✅ | T042、T044 | |
| REQ-IMP-09 | ✅ | T042、T045、T047、T050、T052、T053 | |
| REQ-IMP-10 | ✅ | T020、T022、T030 | |
| REQ-IMP-11 | ✅ | T048、T050、T054 | |
| REQ-IMP-12 | ✅ | T025、T040、T041、T046 | |
| REQ-IMP-13 | ✅ | T025、T036、T037 | |
| REQ-IMP-14 | ✅ | T050 | |
| REQ-IMP-15 | ✅ | T014、T025、T038 | |
| SC-001 | ✅ | T021、T043 | |
| SC-002 | ✅ | T021、T022 | 3 份變形試算表（E1 已修正） |
| SC-004 | ✅ | T059 | |
| SC-006 | ✅ | T058 | |

**Constitution Alignment Issues**: 無。原則 I（T061 圖表一致性驗證）、VI（T033、T034、T058）、VII（T054）、VIII（每個 Story 都有測試，T060 人工驗證）、III（T002 禁止 web 引用 server）都有對應任務。

**Unmapped Tasks**: Setup、Foundational、Polish 的任務（T001–T017、T057–T061）與測試輔助（T018、T027、T028）屬於基礎設施，不需對應單一需求。

## Metrics

- Total Requirements: 15（另有 4 個需要實作的 SC）
- Total Tasks: 61
- Coverage: 100%（每個 REQ 至少 1 個任務）
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0（HIGH 0、MEDIUM 0、LOW 4）

## 跨子功能交界

| 交界 | 結果 |
| --- | --- |
| `QuestionSet`（含 `GuidedNotesSource`）→ 002、003 | ✅ 001 contract、002 data-model、003 record-file 欄位一致 |
| `GoogleAuthService.authorizedClient()` → 003 | ✅ 名稱與用途一致 |
| 老師憑證 → 001 API | ✅ 001 T014 的 middleware 由 002 T010 換成真正的驗證 |


## 重跑結果（2026-11-18，修正後）

- C1：plan.md 新增「共用骨架」一節，列出 Phase 1、2 建立的檔案與用途。
- E1：T022 新增 3 份變形試算表 fixture，T021 逐一驗證（SC-002）。
- 重跑檢查：需求涵蓋 100%；剩下 LOW 4 項（C2、E2、E3、U1），不影響進入實作。

## 重跑結果（2026-11-19，依 PR #3 review 修改後）

spec 依 review 修改（commit `spec(001): 依 review 拿掉手動指定欄位並釐清老師身分`）後，plan、research、data-model、contracts、quickstart、三張圖與 tasks 已同步更新：

- REQ-IMP-05 改為「找不到表頭時拒絕匯入」：移除 `NEEDS_MAPPING`、`MappingSource`、`INVALID_MAPPING`、手動指定的畫面與任務；新增 `NO_HEADER`（附 `expectedHeaders`），對應 T049、T053–T056。
- REQ-IMP-15、AC-05 補上老師身分：T017（首頁取得老師身分、處理 002 AC-34）、T025、T026（沒有老師身分時拒絕）。
- 老師憑證改存分頁的 `sessionStorage`（002 research R6）：T016、T015（新增 RecoverPage 路由）。
- 重跑檢查：15 條需求都有任務、61 個任務編號連續、spec 的每個 AC 都有任務引用、沒有殘留舊用語、類別圖與文件一致；沒有 CRITICAL、HIGH 或 MEDIUM。

## Next Actions

- 沒有 CRITICAL 或 HIGH，依 CLAUDE.md 第 2 節可以進入 `/speckit-implement`。
- MEDIUM 已修正並重跑；LOW 項目可在實作對應任務時順手補上。
