# WebUI API / WS 契约说明（2026-02-07）

## HTTP API

### `GET /api/context`

查询上下文注入与会话摘要，支持 session 维度过滤。

- Query
  - `sessionId`（可选）：只返回该 session 的会话统计与最近对话
  - `limit`（可选，默认 `5`，最大 `20`）：最近会话条数
  - `eventsLimit`（可选，默认 `10`，最大 `100`）：context 事件条数

- Response 关键字段
  - `summary`: string | null
  - `session`: `{ sessionId, conversationCount, lastActivityAt }`
  - `recentConversations`: 最近对话数组
  - `events`: context tracker 事件数组
  - `injection`: 当前拼装后的注入文本

---

### `GET /api/sessions`

查询最近会话摘要（侧栏会话列表数据源）。

- Query
  - `days`（可选，默认 `7`，最大 `30`）
  - `limit`（可选，默认 `50`，最大 `200`）

- Response
  - `sessions: Array<SessionDigest>`

```json
{
  "sessions": [
    {
      "sessionId": "1700000000000-abcd12",
      "title": "Fix WebSocket reconnect loop",
      "startedAt": "2026-02-07T03:10:00.000Z",
      "lastActivityAt": "2026-02-07T03:25:10.000Z",
      "turns": 8,
      "preview": "已修复重连逻辑并补充边界处理。",
      "llm": {
        "providerId": "laogan",
        "model": "claude-opus-4-6",
        "temperature": 0.3,
        "updatedAt": "2026-02-07T03:12:15.000Z"
      }
    }
  ]
}
```

- `llm` 字段说明
  - 来自 `~/.sanbot/memory/session-configs/<sessionId>.json`
  - 若该会话没有持久化模型信息，返回 `null`

---

## WebSocket（Server -> Client）

### 工具事件流

- `tool_start`

```json
{
  "type": "tool_start",
  "id": "tool-1",
  "name": "read_file",
  "input": { "path": "src/web/server.ts" },
  "startedAt": "2026-02-07T03:21:02.120Z"
}
```

- `tool_end`

```json
{
  "type": "tool_end",
  "id": "tool-1",
  "name": "read_file",
  "status": "success",
  "endedAt": "2026-02-07T03:21:02.340Z",
  "durationMs": 220,
  "message": "Read 120 lines"
}
```

### 轮次总结

- `turn_summary`

```json
{
  "type": "turn_summary",
  "startedAt": "2026-02-07T03:20:58.000Z",
  "endedAt": "2026-02-07T03:21:12.000Z",
  "durationMs": 14000,
  "tools": {
    "total": 3,
    "success": 3,
    "error": 0
  },
  "stopped": false
}
```

---

## 会话级模型规则

- `llm_update` 只更新当前 session 的 Agent
- 服务端会在以下时机持久化 session 模型：
  - session 绑定成功后
  - `llm_update` 成功后
  - `/new` 新会话创建后
- 服务端重启后，session 重新绑定时会优先恢复该 session 的持久化模型
