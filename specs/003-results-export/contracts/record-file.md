# Contract: 本機活動紀錄檔

**Owner**: `003-results-export` | **Location**: `<DATA_DIR>/activity-<startedAt>-<activityId>.json`（`DATA_DIR` 預設 `./data`，已列入 `.gitignore`）

## 格式

```json
{
  "version": 2,
  "activityId": "a_7f3c…",
  "questionSet": {
    "source": { "spreadsheetId": "1AbC…", "spreadsheetTitle": "計算機概論基礎 學習單", "sheetId": 0, "sheetName": "學習單" },
    "mapping": { "...": "001 ColumnMapping" },
    "questions": [ "...001 Question，含每個 AnswerSlot 的 cell..." ]
  },
  "groups": [{ "id": "g1", "name": "第 1 組" }],
  "startedAt": "2026-11-18T09:00:00.000+08:00",
  "ended": false,
  "writtenBack": false,
  "csvExported": false,
  "questions": [
    {
      "questionNumber": 1,
      "openedAt": "2026-11-18T09:01:00.000+08:00",
      "closedAt": "2026-11-18T09:01:30.000+08:00",
      "closeReason": "TIMEOUT",
      "submissions": [{ "submissionId": "…", "groupId": "g3", "questionNumber": 1, "answers": { "1-1": "CPU", "1-2": "作業系統" }, "seq": 1, "receivedAt": 1763427678123 }],
      "result": { "questionNumber": 1, "ranking": ["…同 submissions…"], "winnerGroupId": "g3", "closeReason": "TIMEOUT" }
    }
  ]
}
```

## 規則

1. `version` 不認得時（含舊版的 `1`），`loadLatest()` 略過該檔並在 log 記一行警告（不中止啟動）。
2. 寫入流程：寫 `<檔名>.tmp` → `fs.rename` 取代正式檔。
3. 檔案內不得有老師憑證、`participantId`、Google 授權資料或任何機敏資料（原則 VI）；`spreadsheetId` 不是機密，可以保存。
4. 讀取時以 001、002 的型別驗證欄位；格式不符的檔案略過並記警告（原則 VII）。
