# Specification Quality Checklist: 畫面與流程原型

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- 2026-11-21 修訂：新增 1 個 [NEEDS CLARIFICATION]（FR-023：是否需要活動名稱），待 `/speckit-clarify` 處理。
- 2026-11-21 修訂：依「範圍原則」移除 001 自訂的行為規則（組數範圍與預設值、必填欄位、判定順序、送出條件、寫回與匯入失敗的處理、登入失敗的種類），改為註明由負責的子功能定義；引用模擬規則的 AC 改為直接寫出模擬結果。
- 2026-11-21 修訂：移出的規則列在 spec「交給其他子功能定義的事項」（D1–D20），撰寫 002–006 的 spec 時需逐條處理。新增模擬控制「模擬：驗證失敗」，讓 FR-008 的錯誤顯示可以展示與測試。

- 3 個 [NEEDS CLARIFICATION] 已於 2026-11-21 由使用者回答並寫入 spec 的 Clarifications：FR-006／FR-061／M7（模擬控制列推進階段）、M5（模擬：接受／不接受）、FR-056（001 先實作可重送，待 005 確認）。
- spec 中的「介面」表只以業務用語描述介面提供的行為，不指定技術；類別與方法名稱只出現在 `diagrams/001-class.puml`。
- 圖表：`diagrams/001-component`、`001-class`、`001-sequence`（Diagram First 規定的三張）與 `001-screen-flow`（畫面流程狀態圖），`.puml` 與 PNG 皆已產生。
- 圖表以憲法規定的 `java -jar plantuml.jar "./diagrams/*.puml"` 產生 PNG，版面引擎為 Graphviz（本機以 `brew install graphviz` 安裝 16.1.1）；重新產生圖表的組員也需要安裝 Graphviz。
- 畫面流程圖：一位老師與一組學生走完一輪的路徑，以及答案被接受、不接受、重送，共 20 條轉換直接在箭頭上寫觸發；其他 21 條以代號（H1–H2、T1–T15、S1–S4）標示，對照表在圖的下方。確認視窗 T-EndConfirm、T-WriteBack 不畫成節點，併入觸發它的轉換。
