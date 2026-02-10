# WebUI API / WS 契约说明（2026-02-07）

## HTTP API

### `GET /api/health`

服务健康与会话池观测接口（用于发布后巡检/排障）。

- Response 关键字段
  - `status`: 固定为 `ok`
  - `uptimeMs`: 服务运行时长
  - `websocket.connections`: 当前 WebSocket 连接数
  - `websocket.activeSessions`: 当前有连接绑定的会话数
  - `sessionPool`: 会话池统计（`size/maxSize/idleTtlMs/sweepIntervalMs/topSessions`）

```json
{
  "status": "ok",
  "timestamp": "2026-02-07T09:00:00.000Z",
  "uptimeMs": 182345,
  "websocket": {
    "connections": 2,
    "activeSessions": 2
  },
  "sessionPool": {
    "size": 5,
    "maxSize": 50,
    "idleTtlMs": 1800000,
    "oldestIdleMs": 120233,
    "newestIdleMs": 3221,
    "sweepIntervalMs": 60000,
    "topSessions": []
  }
}
```

---

### `GET /api/debug/snapshot`

运行时调试快照（用于远程排障和工单附带信息）。

- Query
  - `sessionsLimit`（可选，默认 `20`，最大 `100`）
  - `sessionDays`（可选，默认 `7`，最大 `30`）
  - `redact`（可选，默认 `1`）：`1/true` 返回脱敏快照，`0/false` 返回原始预览

- Response 关键字段
  - `generatedAt`: 快照生成时间
  - `redacted`: 是否为脱敏输出
  - `health`: 与 `/api/health` 同结构
  - `runtime`: 前端模式、工作目录、会话池配置、provider 目录摘要
  - `activeConnections`: 当前连接与绑定 session 映射
  - `recentSessions`: 最近会话摘要（含 session 级模型）

---

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

### 消息 Envelope（meta）

服务端会在 WS 下行消息附带 `meta`（含 `confirm_request`），用于幂等、顺序和排障。

- `meta.v`: 协议版本（当前为 `1`）
- `meta.seq`: 连接内单调递增序号
- `meta.messageId`: 唯一消息 ID（格式：`<connectionId>:<seq>`）
- `meta.sessionId`: 当前绑定 session
- `meta.connectionId`: 当前连接 ID
- `meta.timestamp`: 服务端发送时间（ISO）

```json
{
  "type": "status",
  "status": "thinking",
  "meta": {
    "v": 1,
    "seq": 42,
    "messageId": "1700000000-abc:42",
    "sessionId": "1700000000000-abcd12",
    "connectionId": "1700000000-abc",
    "timestamp": "2026-02-07T09:10:00.000Z"
  }
}
```

前端应优先用 `meta.messageId` 做去重消费；仅在极少数非 envelope 降级路径下允许 `meta` 缺失。

---

### 工具事件流

- `tool_start`

```json
{
  "type": "tool_start",
  "id": "tool-1",
  "name": "read_file",
  "input": { "path": "src/web/server.ts" },
  "startedAt": "2026-02-07T03:21:02.120Z",
  "meta": { "v": 1, "seq": 12, "messageId": "conn:12", "sessionId": "sid", "connectionId": "conn", "timestamp": "2026-02-07T03:21:02.120Z" }
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
  "message": "Read 120 lines",
  "meta": { "v": 1, "seq": 13, "messageId": "conn:13", "sessionId": "sid", "connectionId": "conn", "timestamp": "2026-02-07T03:21:02.340Z" }
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
- 危险命令确认路由采用异步上下文：`sessionId + connectionId`，不再依赖全局活跃 session
