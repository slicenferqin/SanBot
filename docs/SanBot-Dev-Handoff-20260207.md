# SanBot 开发交接记录（2026-02-07，架构推进版）

## 0. 当前状态（给接手者的 30 秒结论）

主流程已稳定在“可长期使用”阶段：
- WebUI 核心能力完整（事件时间线 / Context Drawer / 会话切换 / 会话级模型）
- M4 两个 P0 架构项已落地：
  1) 确认路由去全局态（改为异步上下文）
  2) SessionPool 生命周期治理（TTL + max size + sweep）
- 新增 `/api/health`，具备基础可观测性

结论：可以继续进入 M5（协议幂等 + 回放一致性 + 自动化回归）。

---

## 1. 本轮完成项（功能 + 架构）

### 1.1 已有功能层（延续）
- 主时间线工具事件化：`tool_start` / `tool_end` / `turn_summary`
- Context 顶部入口 + 右侧抽屉（`/api/context`）
- 最近 7 天会话列表 + 切换（流式中禁止切换）
- 会话级模型隔离 + 会话级模型持久化（重启后恢复）
- 侧栏模型徽章 + 输入区 Codex 风格重构

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

---

## 2. 关键代码变更

### 新增
- `src/web/session-pool.ts`
- `tests/session-pool.test.ts`
- `tests/confirmation-context.test.ts`

### 修改
- `src/utils/confirmation.ts`
- `src/web/server.ts`
- `src/memory/storage.ts`
- `src/index.ts`
- `src/agent.ts`
- `tests/session-llm-config.test.ts`

### 文档
- `docs/WebUI-API-Contracts-20260207.md`（补 `GET /api/health` + 路由说明）
- `docs/SanBot-Dev-Handoff-20260207.md`（本文）

---

## 3. 接口与配置说明

### 3.1 新增健康接口
- `GET /api/health`
- 返回：
  - `status/timestamp/uptimeMs`
  - `websocket.connections`
  - `websocket.activeSessions`
  - `sessionPool`（size/maxSize/idleTtlMs/sweepIntervalMs/topSessions）

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

---

## 5. 里程碑进度（更新）

- M4：RC 稳定化（P0）
  - [x] 确认机制去全局态
  - [x] SessionPool 生命周期治理
- M5：契约冻结 + 自动化回归（P1）
  - [ ] WS envelope 规范化（`v/seq/sessionId/messageId`）
  - [ ] 前端事件幂等消费（重连去重）
  - [ ] 契约测试补齐（WS + /api/*）
- M6：运维与排障闭环（P1）
  - [~] 健康检查接口已就位（第一步）
  - [ ] 启动自检与统一日志字段
  - [ ] 一键调试导出

---

## 6. 下一位接手建议（按顺序）

1. 先做 M5-A：WS envelope 版本化 + 序号化。
2. 再做 M5-B：前端事件去重（基于 `seq/messageId`）。
3. 最后补 M5-C 契约测试（保证重连不重复渲染）。
4. 进入 M6：统一日志字段 + 调试导出。

---

## 7. 产品与架构约束（保持不变）

- 单 LLM 架构：本轮不引入多 Agent。
- 会话切换策略：流式中禁止切换；非流式立即切换；保留草稿。
- 工具事件展示：默认轻量，详情折叠。
- 安全展示：参数默认脱敏，不提供明文模式。
