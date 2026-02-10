# SanBot 开发交接记录（2026-02-07，架构推进版）

## 0. 当前状态（给接手者的 30 秒结论）

主流程已稳定在“可长期使用”阶段：
- WebUI 核心能力完整（事件时间线 / Context Drawer / 会话切换 / 会话级模型）
- M4 两个 P0 架构项已落地：
  1) 确认路由去全局态（改为异步上下文）
  2) SessionPool 生命周期治理（TTL + max size + sweep）
- 新增 `/api/health`，具备基础可观测性
- M5 已完成第二阶段：WS envelope + 前端 messageId 去重 + WS/API 契约测试

结论：M5 主干项已收口，进入回放一致性与 reconnect 场景补强。

---

## 1. 本轮完成项（功能 + 架构）

### 1.1 已有功能层（延续）
- 主时间线工具事件化：`tool_start` / `tool_end` / `turn_summary`
- Context 顶部入口 + 右侧抽屉（`/api/context`）
- 最近 7 天会话列表 + 切换（流式中禁止切换）
- 会话级模型隔离 + 会话级模型持久化（重启后恢复）
- 侧栏模型徽章 + 输入区 Codex 风格重构
- 会话切换状态可视化（Switching 提示、切换期间防误发）

### 1.2 本轮新增架构层（M4）
1. 确认路由去全局态（P0）
   - `src/utils/confirmation.ts`
   - 使用 `AsyncLocalStorage` 承载 `sessionId/connectionId`
   - WebSocket 确认按 `connectionId` 路由，不再依赖全局 `activeSessionId`
   - CLI/TUI 通过 `runWithConfirmationContext(...)` 绑定会话上下文

2. SessionPool 生命周期治理（P0）
   - 新增 `src/web/session-pool.ts`
   - 引入 `maxSize + idleTtlMs + sweep` 机制
   - Web 侧接入池回收与最近会话复用逻辑
   - 回收会跳过当前活跃连接绑定的 session

3. 基础运维观测（M6 的前置）
   - 新增 `GET /api/health`
   - 返回 uptime、WebSocket 连接数、会话池状态与 top sessions

4. 存储健壮性增强（P1 提前落地）
   - `saveSessionLLMConfig` 改为原子写（tmp + rename）
   - 保持坏文件容错回退逻辑

### 1.3 本轮新增架构层（M5 第二阶段）
1. WS envelope 标准化
   - `src/web/adapters.ts` 新增统一发送器 `sendWebSocketMessage(...)`
   - 下行消息附带 `meta`：`v/seq/messageId/sessionId/connectionId/timestamp`
   - `confirm_request` 发送路径也统一走 envelope 发送

2. 前端幂等消费
   - `src/web/frontend/src/hooks/useWebSocket.ts`
   - 基于 `meta.messageId` 去重，带上限缓存（默认 2000）
   - 忽略旧 socket 的晚到消息，降低重连/切会话边界抖动

3. 契约测试补齐（M5-C）
   - `tests/ws-envelope.test.ts`：覆盖序号递增、messageId 生成、无序列状态降级
   - 新增 `tests/web-contracts.test.ts`：覆盖 `/api/health`、`/api/context`、`/api/sessions` 参数回退与响应结构
   - 覆盖 WebSocket 下行 `meta` 协议字段与 `seq` 单调递增

4. 服务端可运维性前置（M6）
   - `startWebServer(...)` 支持测试注入配置并返回可关闭句柄
   - WebSocket 关键日志统一携带 `connectionId/sessionId`
   - 新增 `GET /api/debug/snapshot` 供一键排障导出

5. WebUI 体验打磨
   - Sidebar 支持会话切换进行中状态与阻断误操作
   - Header / Composer 联动显示会话切换状态，避免切换窗口误发消息
   - 输入框草稿改为 session 维度持久化（本地存储），跨会话切换自动恢复
   - 工具事件时间线支持按轮次折叠分组，降低主时间线噪音
   - Settings 新增 Runtime Diagnostics（health 面板 + debug snapshot 复制/下载，默认脱敏）

---

## 2. 关键代码变更

### 新增
- `src/web/session-pool.ts`
- `tests/session-pool.test.ts`
- `tests/confirmation-context.test.ts`
- `tests/ws-envelope.test.ts`
- `tests/web-contracts.test.ts`

### 修改
- `src/utils/confirmation.ts`
- `src/web/server.ts`
- `src/web/adapters.ts`
- `src/memory/storage.ts`
- `src/index.ts`
- `src/agent.ts`
- `src/web/frontend/src/lib/ws-types.ts`
- `src/web/frontend/src/hooks/useWebSocket.ts`
- `tests/session-llm-config.test.ts`

### 文档
- `docs/WebUI-API-Contracts-20260207.md`（补 `GET /api/health` + 路由说明）
- `docs/SanBot-Dev-Handoff-20260207.md`（本文）

---

## 3. 接口与配置说明

### 3.1 健康与调试接口
- `GET /api/health`
- 返回：
  - `status/timestamp/uptimeMs`
  - `websocket.connections`
  - `websocket.activeSessions`
  - `sessionPool`（size/maxSize/idleTtlMs/sweepIntervalMs/topSessions）

- `GET /api/debug/snapshot`
  - 支持 `sessionsLimit/sessionDays` 参数
  - 返回 health + runtime + activeConnections + recentSessions

### 3.2 SessionPool 环境变量
- `SANBOT_SESSION_POOL_MAX`（默认 50）
- `SANBOT_SESSION_IDLE_TTL_MS`（默认 30 分钟）
- `SANBOT_SESSION_SWEEP_INTERVAL_MS`（默认 60 秒）

---

## 4. 质量验证

已通过：
- `bun test`（全量）
- `bun -e "import './src/web/server.ts'"`
- `bun run --cwd src/web/frontend build`

新增测试覆盖：
- 确认路由按 `connectionId` 正确分流
- 审计日志使用上下文 `sessionId`
- SessionPool 过期回收 / 容量回收 / 最近会话行为
- session-config 原子写临时文件无残留
- `/api/health` / `/api/context` / `/api/sessions` 契约与参数回退
- WebSocket 下行 envelope 字段与序号递增

---

## 5. 里程碑进度（更新）

- M4：RC 稳定化（P0）
  - [x] 确认机制去全局态
  - [x] SessionPool 生命周期治理
- M5：契约冻结 + 自动化回归（P1）
  - [x] WS envelope 规范化（`v/seq/sessionId/messageId`）
  - [x] 前端事件幂等消费（基于 `messageId` 去重）
  - [x] 契约测试补齐（WS + /api/*，含参数回退）
  - [ ] 回放一致性（`chat_history + tool events`）专项测试
- M6：运维与排障闭环（P1）
  - [~] 健康检查接口 + WebSocket 关键日志字段已就位
  - [ ] 启动自检与统一日志字段收口
  - [ ] 一键调试导出

---

## 6. 下一位接手建议（按顺序）

1. 优先补齐回放一致性测试（`chat_history + tool events`），明确刷新后渲染契约。
2. 增加 reconnect 场景的端到端去重回归用例（断线重连/会话切换/迟到消息）。
3. 继续 M6：启动自检日志 + 一键调试导出。
4. 视情况评估服务器端增量重放接口（可选，支持大会话恢复）。

---

## 7. 产品与架构约束（保持不变）

- 单 LLM 架构：本轮不引入多 Agent。
- 会话切换策略：流式中禁止切换；非流式立即切换；保留草稿。
- 工具事件展示：默认轻量，详情折叠。
- 安全展示：参数默认脱敏，不提供明文模式。
